import { NextResponse } from "next/server";
import {
  EmployeeDomainError,
  IdentityConfigurationError,
  IdentityRequiredError
} from "@/lib/identity/types";
import { identityMode, requireEmployeeIdentity } from "@/lib/identity/server";
import { CoveAccessDeniedError, requireCoveUser } from "@/lib/access/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const identity = await requireEmployeeIdentity();
    await requireCoveUser(identity);
    return NextResponse.json(
      { identity, mode: identityMode() },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof IdentityRequiredError) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    if (error instanceof EmployeeDomainError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof CoveAccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof IdentityConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Identity check failed" }, { status: 500 });
  }
}
