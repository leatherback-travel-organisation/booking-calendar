import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { permissionNamespace } from "@/lib/access/cove-service-contract";
import {
  getAccessSnapshot,
  requireApplicationPermission,
  requireCoveUser,
} from "@/lib/access/server";
import { requireVerifiedIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

function signTicket(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function GET(request: NextRequest) {
  const secret = process.env.COVE_HANDOFF_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "Cove application handoff is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const applicationSlug = request.nextUrl.searchParams.get("applicationSlug")?.trim();
  if (!applicationSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(applicationSlug)) {
    return NextResponse.json(
      { error: "A valid Cove application is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const identity = await requireVerifiedIdentity();
    const user = await requireCoveUser(identity);
    await requireApplicationPermission(
      identity,
      applicationSlug,
      `${permissionNamespace(applicationSlug)}.open`,
    );

    const snapshot = await getAccessSnapshot();
    const application = snapshot.applications.find(
      (candidate) => candidate.slug === applicationSlug && candidate.status === "active",
    );
    if (!application) throw new Error("The requested application is not active.");

    const payload = Buffer.from(JSON.stringify({
      v: 1,
      applicationSlug,
      userId: user.id,
      email: user.email,
      population: user.population,
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: randomUUID(),
    })).toString("base64url");
    const ticket = `${payload}.${signTicket(payload, secret)}`;
    const destination = new URL(application.launchUrl);
    destination.searchParams.set("cove_ticket", ticket);

    return NextResponse.redirect(destination, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Cove access to this application is not active." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
