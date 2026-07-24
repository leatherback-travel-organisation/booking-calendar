import "server-only";

import { identityMode } from "@/lib/identity/server";
import type { VerifiedIdentity } from "@/lib/identity/types";
import { databaseConfigured } from "@/lib/db/neon";
import { evaluateEntitlement, listAccessibleApplications } from "./evaluator";
import type {
  AccessGrant,
  AccessSnapshot,
  Application,
  PlatformRole,
  User
} from "./model";
import type { AccessDirectory } from "./admin-model";
import type { AuditFeed } from "./audit-integrity";
import {
  bindInvitedIdentity,
  bootstrapFirstAdmin,
  getPostgresAccessDirectory,
  getPostgresAuditFeed,
  getPostgresAccessSnapshot,
  rebindRetiredClerkIdentity,
  touchIdentityAuthentication,
} from "./postgres";
import { previewAccessSnapshot, previewAuditEvents } from "./preview-data";

export class AccessStoreUnavailableError extends Error {
  constructor() {
    super("The SuperPanel access store is not configured.");
    this.name = "AccessStoreUnavailableError";
  }
}

export class CoveAccessDeniedError extends Error {
  constructor() {
    super("This Google identity has not been approved for Cove.");
    this.name = "CoveAccessDeniedError";
  }
}

export async function getAccessSnapshot(): Promise<AccessSnapshot> {
  if (identityMode() === "preview") return previewAccessSnapshot;
  if (databaseConfigured()) return getPostgresAccessSnapshot();
  throw new AccessStoreUnavailableError();
}

export async function getAccessDirectory(): Promise<AccessDirectory> {
  if (identityMode() === "preview") {
    return {
      people: [],
      applications: previewAccessSnapshot.applications,
      writable: false,
      source: "demo",
      message: "Demonstration mode uses synthetic access data. Changes are disabled and nothing shown here is a real person.",
    };
  }
  if (databaseConfigured()) return getPostgresAccessDirectory();
  return {
    people: [],
    applications: [],
    writable: false,
    source: "unavailable",
    message: "The access database is not configured. Cove is denying all account changes.",
  };
}

export async function getAccessAuditFeed(): Promise<AuditFeed> {
  if (identityMode() === "preview") {
    return {
      events: previewAuditEvents.map((event) => ({
        ...event,
        actorName: previewAccessSnapshot.users.find((user) => user.id === event.actorUserId)?.displayName ?? "System",
        applicationName: previewAccessSnapshot.applications.find((application) => application.id === event.applicationId)?.name,
      })),
      source: "demo",
      message: "Demonstration mode shows synthetic audit events only. No live user activity is connected.",
    };
  }
  if (databaseConfigured()) {
    try {
      return await getPostgresAuditFeed();
    } catch {
      return {
        events: [],
        source: "unavailable",
        message: "The audit feed could not be verified, so Cove is not showing partial or untrusted events.",
      };
    }
  }
  return {
    events: [],
    source: "unavailable",
    message: "The access database is not configured. No live audit events are available.",
  };
}

export function findAccessUser(
  identity: VerifiedIdentity,
  snapshot: AccessSnapshot
): User | null {
  return (
    snapshot.users.find(
      (candidate) =>
        candidate.identitySubject === identity.subject &&
        candidate.identityIssuer === identity.issuer &&
        candidate.status === "active"
    ) ?? null
  );
}

export async function accessibleApplicationsFor(
  identity: VerifiedIdentity
): Promise<readonly Application[]> {
  const snapshot = await getAccessSnapshot();
  return listAccessibleApplications({
    identity,
    snapshot,
    now: new Date()
  });
}

/**
 * Cove is allowlist-first. A verified Leatherback identity is necessary,
 * but it is never sufficient: an active Cove user record must already exist.
 */
export async function requireCoveUser(identity: VerifiedIdentity): Promise<User> {
  let snapshot = await getAccessSnapshot();
  let user = findAccessUser(identity, snapshot);

  if (!user && identityMode() === "clerk" && databaseConfigured()) {
    const bound = await bindInvitedIdentity(identity);
    const bootstrapped = bound ? false : await bootstrapFirstAdmin(identity);
    const rebound =
      bound || bootstrapped ? false : await rebindRetiredClerkIdentity(identity);
    if (bound || bootstrapped || rebound) {
      snapshot = await getPostgresAccessSnapshot();
      user = findAccessUser(identity, snapshot);
    }
  }

  if (!user) throw new CoveAccessDeniedError();
  if (identityMode() === "clerk" && databaseConfigured()) {
    await touchIdentityAuthentication(identity).catch(() => undefined);
  }
  return user;
}

export async function requireApplicationPermission(
  identity: VerifiedIdentity,
  applicationSlug: string,
  requiredPermission: string,
): Promise<AccessGrant> {
  const snapshot = await getAccessSnapshot();
  const application = snapshot.applications.find((candidate) => candidate.slug === applicationSlug);
  if (!application) throw new Error("The requested application is not registered.");
  const decision = evaluateEntitlement({
    identity,
    applicationId: application.id,
    snapshot,
    now: new Date(),
    requiredPermission,
  });
  if (!decision.allowed) throw new Error("Application access is denied.");
  return decision;
}

export async function hasPlatformRole(
  identity: VerifiedIdentity,
  allowedRoles: readonly PlatformRole[]
): Promise<boolean> {
  try {
    const snapshot = await getAccessSnapshot();
    const user = findAccessUser(identity, snapshot);
    return Boolean(
      user && user.platformRoles.some((role) => allowedRoles.includes(role))
    );
  } catch {
    return false;
  }
}

export async function requirePlatformRole(
  identity: VerifiedIdentity,
  allowedRoles: readonly PlatformRole[]
): Promise<User> {
  const snapshot = await getAccessSnapshot();
  const user = findAccessUser(identity, snapshot);
  if (!user || !user.platformRoles.some((role) => allowedRoles.includes(role))) {
    throw new Error("Platform administration access is denied.");
  }
  return user;
}
