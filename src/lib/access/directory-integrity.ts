import type { AccessDirectoryPerson, AccessDirectoryStatus } from "./admin-model.ts";
import type {
  Application,
  ApplicationAccessLevel,
  IdentityPopulation,
  PlatformRole,
  UserStatus,
} from "./model.ts";
import { parseOptionalDatabaseTimestamp } from "./policy-integrity.ts";
import { parseApplicationRegistry } from "./registry.ts";

export type AccessDirectoryRow = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const populations = new Set<IdentityPopulation>(["employee", "external_partner"]);
const userStatuses = new Set<UserStatus>(["active", "suspended", "deprovisioned"]);
const invitationStatuses = new Set(["pending", "accepted", "revoked", "expired"]);
const platformRoles = new Set<PlatformRole>([
  "super_admin",
  "access_admin",
  "systems_admin",
  "application_admin",
  "finance_admin",
  "people_admin",
  "auditor",
]);
const accessLevels = new Set<ApplicationAccessLevel>(["user", "admin"]);

function requiredText(row: AccessDirectoryRow, key: string, maximum = 320): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`Access directory field ${key} is invalid.`);
  }
  return value.trim();
}

function optionalText(row: AccessDirectoryRow, key: string): string | undefined {
  const value = row[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Access directory field ${key} is invalid.`);
  }
  return value.trim();
}

function requiredCount(row: AccessDirectoryRow, key: string): number {
  const raw = row[key];
  const value = typeof raw === "number" || typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Access directory field ${key} is invalid.`);
  }
  return value;
}

function stringArray(row: AccessDirectoryRow, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Access directory field ${key} is not a string array.`);
  }
  return value.map((item) => item.trim());
}

function initialsFor(name: string, email: string): string {
  const initials = (name || email.split("@")[0])
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  if (!initials) throw new Error("Access directory cannot derive person initials.");
  return initials;
}

function parseApplicationAccess(
  row: AccessDirectoryRow,
  applicationSlugs: ReadonlySet<string>,
): Readonly<Record<string, ApplicationAccessLevel>> {
  const value = row.application_access;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Access directory application_access is not an object.");
  }

  const access: Record<string, ApplicationAccessLevel> = {};
  for (const [slug, level] of Object.entries(value)) {
    if (!applicationSlugs.has(slug)) {
      throw new Error("Access directory references an unknown application.");
    }
    if (typeof level !== "string" || !accessLevels.has(level as ApplicationAccessLevel)) {
      throw new Error("Access directory contains an invalid application access level.");
    }
    access[slug] = level as ApplicationAccessLevel;
  }
  return access;
}

function directoryStatus(input: {
  userStatus: UserStatus;
  identityCount: number;
  invitationStatus?: string;
  invitationExpiresAt?: string;
  now: Date;
}): AccessDirectoryStatus {
  if (input.userStatus === "suspended" || input.userStatus === "deprovisioned") {
    return input.userStatus;
  }
  if (input.identityCount > 0) return "active";
  if (input.invitationStatus === "pending") {
    return input.invitationExpiresAt && Date.parse(input.invitationExpiresAt) <= input.now.getTime()
      ? "invitation_expired"
      : "invited";
  }
  if (input.invitationStatus === "expired") return "invitation_expired";
  if (input.invitationStatus === "revoked") return "invitation_revoked";
  throw new Error("Access directory contains an active user without an identity or usable invitation.");
}

function parsePerson(
  row: AccessDirectoryRow,
  applications: readonly Application[],
  now: Date,
): AccessDirectoryPerson {
  const id = requiredText(row, "id");
  if (!UUID.test(id)) throw new Error("Access directory user ID is not a UUID.");

  const population = requiredText(row, "population") as IdentityPopulation;
  const userStatus = requiredText(row, "status") as UserStatus;
  const email = requiredText(row, "email");
  const name = requiredText(row, "display_name", 120);
  if (!populations.has(population)) throw new Error("Access directory contains an invalid population.");
  if (!userStatuses.has(userStatus)) throw new Error("Access directory contains an invalid user status.");
  if (!EMAIL.test(email) || email !== email.toLowerCase()) {
    throw new Error("Access directory contains an invalid user email.");
  }

  const identityCount = requiredCount(row, "identity_count");
  const invitationStatus = optionalText(row, "invitation_status");
  if (invitationStatus && !invitationStatuses.has(invitationStatus)) {
    throw new Error("Access directory contains an invalid invitation status.");
  }

  const lastAuthenticatedAt = parseOptionalDatabaseTimestamp(row.last_authenticated_at, "last_authenticated_at");
  const invitedAt = parseOptionalDatabaseTimestamp(row.invited_at, "invited_at");
  const invitationExpiresAt = parseOptionalDatabaseTimestamp(row.invitation_expires_at, "invitation_expires_at");
  if (lastAuthenticatedAt && identityCount === 0) {
    throw new Error("Access directory authentication history has no bound identity.");
  }
  if (invitationStatus ? !invitedAt : invitedAt || invitationExpiresAt) {
    throw new Error("Access directory contains inconsistent invitation history.");
  }
  if (invitedAt && invitationExpiresAt && Date.parse(invitationExpiresAt) <= Date.parse(invitedAt)) {
    throw new Error("Access directory contains an invalid invitation window.");
  }
  if (identityCount === 0 && invitationStatus === "accepted") {
    throw new Error("Access directory contains an accepted invitation without a bound identity.");
  }
  if (identityCount > 0 && invitationStatus === "pending") {
    throw new Error("Access directory contains a pending invitation for a bound identity.");
  }

  const rawRoles = stringArray(row, "platform_roles");
  if (rawRoles.some((role) => !platformRoles.has(role as PlatformRole))) {
    throw new Error("Access directory contains an invalid platform role.");
  }
  if (new Set(rawRoles).size !== rawRoles.length) {
    throw new Error("Access directory contains duplicate platform roles.");
  }
  if (population !== "employee" && rawRoles.length > 0) {
    throw new Error("External partners cannot hold Cove platform roles.");
  }

  return {
    id,
    initials: initialsFor(name, email),
    name,
    email,
    population,
    status: directoryStatus({ userStatus, identityCount, invitationStatus, invitationExpiresAt, now }),
    userStatus,
    platformRoles: rawRoles as PlatformRole[],
    applicationAccess: parseApplicationAccess(row, new Set(applications.map((application) => application.slug))),
    lastAuthenticatedAt,
    invitedAt,
    invitationExpiresAt,
  };
}

export function parseAccessDirectoryRows(input: {
  readonly personRows: readonly AccessDirectoryRow[];
  readonly applicationRows: readonly AccessDirectoryRow[];
  readonly now?: Date;
}): { readonly people: readonly AccessDirectoryPerson[]; readonly applications: readonly Application[] } {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Access directory evaluation time is invalid.");
  const applications = parseApplicationRegistry(input.applicationRows);
  const people = input.personRows.map((row) => parsePerson(row, applications, now));
  if (new Set(people.map((person) => person.id)).size !== people.length) {
    throw new Error("Access directory contains duplicate user IDs.");
  }
  if (new Set(people.map((person) => person.email)).size !== people.length) {
    throw new Error("Access directory contains duplicate user emails.");
  }
  return { people, applications };
}
