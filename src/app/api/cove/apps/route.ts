import { NextResponse } from "next/server";
import {
  AccessStoreUnavailableError,
  accessibleApplicationsFor,
  CoveAccessDeniedError,
  requireCoveUser,
} from "@/lib/access/server";
import { databaseConfigured } from "@/lib/db/neon";
import { coveApplicationLaunchUrl } from "@/lib/identity/canonical-origin";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import {
  EmployeeDomainError,
  IdentityConfigurationError,
  IdentityRequiredError,
} from "@/lib/identity/types";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: noStoreHeaders });
}

export async function GET() {
  try {
    if (!databaseConfigured()) throw new AccessStoreUnavailableError();

    const identity = await requireEmployeeIdentity();
    await requireCoveUser(identity);
    const applications = await accessibleApplicationsFor(identity);

    return NextResponse.json(
      {
        applications: applications.map((application) => ({
          id: application.id,
          slug: application.slug,
          name: application.name,
          description: application.description,
          href: coveApplicationLaunchUrl(application.slug),
        })),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof IdentityRequiredError) {
      return errorResponse(401, "Sign in through Cove to view your applications.");
    }
    if (error instanceof EmployeeDomainError || error instanceof CoveAccessDeniedError) {
      return errorResponse(403, "Your Cove application access is not active.");
    }
    if (error instanceof IdentityConfigurationError || error instanceof AccessStoreUnavailableError) {
      return errorResponse(503, "Cove application access is temporarily unavailable.");
    }
    console.error("[cove-app-directory] failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse(503, "Cove could not load your applications.");
  }
}
