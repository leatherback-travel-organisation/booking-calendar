import { NextResponse } from "next/server";
import { evaluateEntitlement } from "@/lib/access/evaluator";
import {
  accessLevelForGrant,
  coveAccessRequestSchema,
  grantSatisfiesRequiredRole,
  permissionNamespace,
  resolveCanonicalApplication,
  type CoveAccessDenialResponse,
  type CoveAccessGrantResponse,
} from "@/lib/access/cove-service-contract";
import {
  AccessStoreUnavailableError,
  CoveAccessDeniedError,
  getAccessSnapshot,
  requireCoveUser,
} from "@/lib/access/server";
import { databaseConfigured } from "@/lib/db/neon";
import { requireVerifiedIdentity } from "@/lib/identity/server";
import {
  IdentityConfigurationError,
  IdentityRequiredError,
} from "@/lib/identity/types";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

function denial(status: number, body: CoveAccessDenialResponse) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 4_096) {
      return denial(400, { allowed: false, code: "invalid_request", message: "The access request is too large." });
    }
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return denial(415, { allowed: false, code: "invalid_request", message: "Send a JSON access request." });
    }

    const parsed = coveAccessRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return denial(400, { allowed: false, code: "invalid_request", message: parsed.error.issues[0]?.message ?? "The access request is invalid." });
    }
    if (!databaseConfigured()) throw new AccessStoreUnavailableError();

    const identity = await requireVerifiedIdentity();
    await requireCoveUser(identity);
    const snapshot = await getAccessSnapshot();
    const application = resolveCanonicalApplication(snapshot, parsed.data);
    if (!application) {
      return denial(403, { allowed: false, code: "access_denied", message: "This application is not available through Cove." });
    }

    const namespace = permissionNamespace(application.slug);
    const decision = evaluateEntitlement({
      identity,
      applicationId: application.id,
      snapshot,
      now: new Date(),
      requiredPermission: `${namespace}.open`,
    });
    if (!decision.allowed) {
      return denial(403, { allowed: false, code: "access_denied", message: "Your Cove access to this application is not active." });
    }
    if (!grantSatisfiesRequiredRole(snapshot, decision, parsed.data.requiredRole)) {
      return denial(403, { allowed: false, code: "role_required", message: "This area requires Cove Admin access." });
    }

    const response: CoveAccessGrantResponse = {
      allowed: true,
      application: { id: application.id, slug: application.slug, name: application.name },
      user: { id: decision.user.id },
      role: accessLevelForGrant(snapshot, decision),
      permissions: decision.permissions,
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof IdentityRequiredError) {
      return denial(401, { allowed: false, code: "authentication_required", message: "Sign in through Cove to continue." });
    }
    if (error instanceof CoveAccessDeniedError) {
      return denial(403, { allowed: false, code: "access_denied", message: error.message });
    }
    if (error instanceof IdentityConfigurationError) {
      return denial(503, { allowed: false, code: "configuration_error", message: "Cove sign-in is not configured." });
    }
    if (error instanceof AccessStoreUnavailableError) {
      return denial(503, { allowed: false, code: "service_unavailable", message: "Cove access checks are temporarily unavailable." });
    }
    console.error("[cove-access-service] failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return denial(503, { allowed: false, code: "service_unavailable", message: "Cove could not verify application access." });
  }
}
