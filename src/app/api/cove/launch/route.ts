import { NextRequest, NextResponse } from "next/server";
import { permissionNamespace } from "@/lib/access/cove-service-contract";
import {
  getAccessSnapshot,
  requireApplicationPermission,
  requireCoveUser,
} from "@/lib/access/server";
import { createCoveHandoffTicket } from "@/lib/cove-handoff/protocol";
import { requireVerifiedIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

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

    const ticket = createCoveHandoffTicket({
      applicationSlug,
      userId: user.id,
      email: user.email,
      population: user.population,
    }, secret);
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
