import "server-only";

import { databaseConfigured } from "@/lib/db/neon";
import type { VerifiedIdentity } from "@/lib/identity/types";
import { identityMode } from "@/lib/identity/server";
import { getAccessSnapshot, requirePlatformRole } from "./server";
import { getPostgresActiveCovePeopleForSystems } from "./systems-port-postgres";
import {
  buildApplicationAccessSummary,
  parseProvisionApplicationInput,
  type ActiveCovePerson,
  type ApplicationAccessSummary,
  type AtomicApplicationProvisioner,
  type ProvisionApplicationInput,
  type ProvisionedApplication,
  type SystemsOperator,
} from "./systems-port-model";

export type {
  ActiveCovePerson,
  ApplicationAccessSummary,
  ApplicationAccessSummaryUser,
  AtomicApplicationProvisioner,
  AuthorizedProvisionApplicationCommand,
  ProvisionApplicationInput,
  ProvisionedApplication,
  SystemsOperator,
} from "./systems-port-model";

function requireVerifiedEmployeeIdentity(identity: VerifiedIdentity): void {
  const verifiedAt = Date.parse(identity.verifiedAt);
  if (
    identity.population !== "employee" ||
    !identity.emailVerified ||
    Number.isNaN(verifiedAt) ||
    verifiedAt > Date.now()
  ) {
    throw new Error("A verified Leatherback Travel employee identity is required.");
  }
}

/** The only authorization gate Systems code should use. */
export async function requireSystemsOperator(identity: VerifiedIdentity): Promise<SystemsOperator> {
  requireVerifiedEmployeeIdentity(identity);
  const user = await requirePlatformRole(identity, ["super_admin", "systems_admin"]);
  if (
    user.population !== "employee" ||
    !identity.workspaceDomain ||
    !user.workspaceDomain ||
    identity.workspaceDomain.toLowerCase() !== user.workspaceDomain.toLowerCase()
  ) {
    throw new Error("SuperPanel systems access is restricted to verified employees.");
  }
  return {
    userId: user.id,
    displayName: user.displayName,
    verifiedEmail: user.email,
  };
}

/**
 * Read-only picker data for approved Cove employees. A live invitation is
 * eligible before first sign-in, but its access remains dormant until Google
 * binds a verified identity to the existing user record.
 */
export async function listActiveCovePeopleForSystems(
  identity: VerifiedIdentity,
): Promise<readonly ActiveCovePerson[]> {
  await requireSystemsOperator(identity);
  if (databaseConfigured()) return getPostgresActiveCovePeopleForSystems();
  if (identityMode() !== "preview") {
    throw new Error("The live Cove people directory is unavailable.");
  }

  const snapshot = await getAccessSnapshot();
  return snapshot.users
    .filter((user) => user.population === "employee" && user.status === "active")
    .map((user) => ({
      userId: user.id,
      displayName: user.displayName,
      verifiedEmail: user.email,
      status: "active" as const,
      identityVerified: true,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.verifiedEmail.localeCompare(b.verifiedEmail));
}

/**
 * Auth-owned provisioning command used by the Systems registration workflow.
 * It creates the canonical application plus exactly one User and one Admin role.
 */
export async function provisionApplicationAccess<Result extends ProvisionedApplication>(
  identity: VerifiedIdentity,
  input: ProvisionApplicationInput | unknown,
  persistAtomically: AtomicApplicationProvisioner<Result>,
): Promise<Result> {
  const actor = await requireSystemsOperator(identity);
  if (!databaseConfigured() || identityMode() !== "clerk") {
    throw new Error("Application provisioning is disabled outside the authenticated live environment.");
  }
  return persistAtomically({
    ...parseProvisionApplicationInput(input),
    actorUserId: actor.userId,
  });
}

/** Read-only effective User/Admin context for a registered application. */
export async function getApplicationAccessSummary(
  identity: VerifiedIdentity,
  applicationId: string,
): Promise<ApplicationAccessSummary> {
  await requireSystemsOperator(identity);
  const snapshot = await getAccessSnapshot();
  return buildApplicationAccessSummary(snapshot, applicationId, new Date());
}
