import { parseApplicationRegistry } from "./registry.ts";
import type {
  AccessSnapshot,
  ApplicationAccessLevel,
  ApplicationRole,
  Entitlement,
  IdentityPopulation,
  PartnerOrganisation,
  PlatformRole,
  Team,
  TeamMembership,
  User,
  UserStatus,
} from "./model.ts";

export type AccessPolicyRow = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_KEY = /^[a-z][a-z0-9_]*$/;
const PERMISSION = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const populations = new Set<IdentityPopulation>(["employee", "external_partner"]);
const userStatuses = new Set<UserStatus>(["active", "suspended", "deprovisioned"]);
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

function requiredText(row: AccessPolicyRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Access policy field ${key} is invalid.`);
  }
  return value.trim();
}

function optionalText(row: AccessPolicyRow, key: string): string | undefined {
  const value = row[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Access policy field ${key} is invalid.`);
  }
  return value.trim();
}

function requiredId(row: AccessPolicyRow, key: string): string {
  const value = requiredText(row, key);
  if (!UUID.test(value)) throw new Error(`Access policy field ${key} is not a UUID.`);
  return value;
}

function optionalId(row: AccessPolicyRow, key: string): string | undefined {
  const value = optionalText(row, key);
  if (value && !UUID.test(value)) throw new Error(`Access policy field ${key} is not a UUID.`);
  return value;
}

function databaseBoolean(value: unknown, key: string): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`Access policy field ${key} is not a boolean.`);
}

export function parseOptionalDatabaseTimestamp(value: unknown, key: string): string | undefined {
  if (value == null || value === "") return undefined;
  const parsed = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.valueOf())) {
    throw new Error(`Access policy field ${key} is not a valid timestamp.`);
  }
  return parsed.toISOString();
}

function requiredTimestamp(row: AccessPolicyRow, key: string): string {
  const value = parseOptionalDatabaseTimestamp(row[key], key);
  if (!value) throw new Error(`Access policy field ${key} is required.`);
  return value;
}

function stringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Access policy field ${key} is not a string array.`);
  }
  return value.map((item) => item.trim());
}

function allowedPopulations(row: AccessPolicyRow): IdentityPopulation[] {
  const result: IdentityPopulation[] = [];
  if (databaseBoolean(row.allows_employees, "allows_employees")) result.push("employee");
  if (databaseBoolean(row.allows_external_partners, "allows_external_partners")) result.push("external_partner");
  if (result.length === 0) throw new Error("An access role must allow at least one identity population.");
  return result;
}

function assertUniqueIds(items: readonly { id: string }[], label: string) {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error(`Access policy contains duplicate ${label} IDs.`);
  }
}

function assertReference(ids: ReadonlySet<string>, id: string, label: string) {
  if (!ids.has(id)) throw new Error(`Access policy references an unknown ${label}.`);
}

export function parseAccessPolicyRows(input: {
  readonly userReferenceRows: readonly AccessPolicyRow[];
  readonly userRows: readonly AccessPolicyRow[];
  readonly platformRoleRows: readonly AccessPolicyRow[];
  readonly organisationRows: readonly AccessPolicyRow[];
  readonly teamRows: readonly AccessPolicyRow[];
  readonly membershipRows: readonly AccessPolicyRow[];
  readonly applicationRows: readonly AccessPolicyRow[];
  readonly applicationRoleRows: readonly AccessPolicyRow[];
  readonly entitlementRows: readonly AccessPolicyRow[];
}): AccessSnapshot {
  const userReferences = input.userReferenceRows.map((row) => ({
    id: requiredId(row, "id"),
  }));
  assertUniqueIds(userReferences, "user reference");
  const knownUserIds = new Set(userReferences.map((user) => user.id));

  const rolesByUser = new Map<string, PlatformRole[]>();
  for (const row of input.platformRoleRows) {
    const userId = requiredId(row, "user_id");
    const grantedByUserId = requiredId(row, "granted_by_user_id");
    const role = requiredText(row, "role");
    if (!platformRoles.has(role as PlatformRole)) throw new Error("Access policy contains an invalid platform role.");
    assertReference(knownUserIds, userId, "platform-role user");
    assertReference(knownUserIds, grantedByUserId, "platform-role grantor");
    rolesByUser.set(userId, [...(rolesByUser.get(userId) ?? []), role as PlatformRole]);
  }

  const users: User[] = input.userRows.map((row) => {
    const population = requiredText(row, "population");
    const status = requiredText(row, "status");
    const email = requiredText(row, "email");
    const workspaceDomain = optionalText(row, "workspace_domain");
    const partnerOrganisationId = optionalId(row, "partner_organisation_id");
    const sessionVersion = Number(row.session_version);
    if (!populations.has(population as IdentityPopulation)) throw new Error("Access policy contains an invalid user population.");
    if (!userStatuses.has(status as UserStatus)) throw new Error("Access policy contains an invalid user status.");
    if (!EMAIL.test(email) || email !== email.toLowerCase()) throw new Error("Access policy contains an invalid user email.");
    if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 1) throw new Error("Access policy contains an invalid session version.");
    if (population === "employee" ? !workspaceDomain || partnerOrganisationId : workspaceDomain || !partnerOrganisationId) {
      throw new Error("Access policy contains an invalid user population binding.");
    }
    const id = requiredId(row, "id");
    assertReference(knownUserIds, id, "identity-bound user");
    const assignedPlatformRoles = [...new Set(rolesByUser.get(id) ?? [])];
    if (population !== "employee" && assignedPlatformRoles.length > 0) {
      throw new Error("External partners cannot hold Cove platform roles.");
    }
    return {
      id,
      identitySubject: requiredText(row, "identity_subject"),
      identityIssuer: requiredText(row, "identity_issuer"),
      population: population as IdentityPopulation,
      email,
      displayName: requiredText(row, "display_name"),
      status: status as UserStatus,
      workspaceDomain,
      partnerOrganisationId,
      platformRoles: assignedPlatformRoles,
      sessionVersion,
    };
  });

  const partnerOrganisations: PartnerOrganisation[] = input.organisationRows.map((row) => {
    const status = requiredText(row, "status");
    if (status !== "active" && status !== "suspended") throw new Error("Access policy contains an invalid partner status.");
    return { id: requiredId(row, "id"), name: requiredText(row, "name"), status };
  });
  const teams: Team[] = input.teamRows.map((row) => {
    const status = requiredText(row, "status");
    if (status !== "active" && status !== "archived") throw new Error("Access policy contains an invalid team status.");
    return { id: requiredId(row, "id"), name: requiredText(row, "name"), description: optionalText(row, "description") ?? "", status };
  });
  const applications = parseApplicationRegistry(input.applicationRows);
  for (const application of applications) {
    if (!UUID.test(application.id)) throw new Error("Access policy application ID is not a UUID.");
  }

  const teamMemberships: TeamMembership[] = input.membershipRows.map((row) => {
    const userId = requiredId(row, "user_id");
    const grantedByUserId = requiredId(row, "granted_by_user_id");
    assertReference(knownUserIds, userId, "membership user");
    assertReference(knownUserIds, grantedByUserId, "membership grantor");
    return {
      teamId: requiredId(row, "team_id"),
      userId,
      startsAt: parseOptionalDatabaseTimestamp(row.starts_at, "starts_at"),
      expiresAt: parseOptionalDatabaseTimestamp(row.expires_at, "expires_at"),
      revokedAt: parseOptionalDatabaseTimestamp(row.revoked_at, "revoked_at"),
    };
  });

  const roles: ApplicationRole[] = input.applicationRoleRows.map((row) => {
    const key = requiredText(row, "role_key");
    const level = requiredText(row, "access_level");
    const permissions = stringArray(row.permissions, "permissions");
    if (!ROLE_KEY.test(key)) throw new Error("Access policy contains an invalid application role key.");
    if (!accessLevels.has(level as ApplicationAccessLevel)) throw new Error("Access policy contains an invalid application access level.");
    if (permissions.some((permission) => !PERMISSION.test(permission))) throw new Error("Access policy contains an invalid permission.");
    return {
      id: requiredId(row, "id"),
      applicationId: requiredId(row, "application_id"),
      key,
      name: requiredText(row, "name"),
      level: level as ApplicationAccessLevel,
      permissions: [...new Set(permissions)],
      allowedPopulations: allowedPopulations(row),
    };
  });

  const entitlements: Entitlement[] = input.entitlementRows.map((row) => {
    const subjectType = requiredText(row, "subject_type");
    const userId = optionalId(row, "user_id");
    const teamId = optionalId(row, "team_id");
    const grantedByUserId = requiredId(row, "granted_by_user_id");
    if (subjectType === "user" ? !userId || teamId : subjectType === "team" ? !teamId || userId : true) {
      throw new Error("Access policy contains an invalid entitlement subject.");
    }
    if (userId) assertReference(knownUserIds, userId, "entitlement user");
    assertReference(knownUserIds, grantedByUserId, "entitlement grantor");
    const startsAt = parseOptionalDatabaseTimestamp(row.starts_at, "starts_at");
    const expiresAt = parseOptionalDatabaseTimestamp(row.expires_at, "expires_at");
    if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
      throw new Error("Access policy contains an invalid entitlement window.");
    }
    const partnerOrganisationIds = stringArray(row.partner_organisation_ids, "partner_organisation_ids");
    const allPartnerOrganisations = databaseBoolean(row.all_partner_organisations, "all_partner_organisations");
    if (allPartnerOrganisations && partnerOrganisationIds.length > 0) {
      throw new Error("Access policy contains a contradictory entitlement scope.");
    }
    return {
      id: requiredId(row, "id"),
      applicationId: requiredId(row, "application_id"),
      roleId: requiredId(row, "role_id"),
      subject: subjectType === "user" ? { type: "user", userId: userId! } : { type: "team", teamId: teamId! },
      scope: allPartnerOrganisations
        ? { allPartnerOrganisations: true }
        : partnerOrganisationIds.length
          ? { partnerOrganisationIds }
          : undefined,
      startsAt,
      expiresAt,
      revokedAt: parseOptionalDatabaseTimestamp(row.revoked_at, "revoked_at"),
      revokedReason: optionalText(row, "revoked_reason"),
      grantedByUserId,
      grantedAt: requiredTimestamp(row, "granted_at"),
    };
  });

  if (new Set(users.map((user) => `${user.identityIssuer}\u0000${user.identitySubject}`)).size !== users.length) {
    throw new Error("Access policy contains duplicate identity subjects.");
  }
  assertUniqueIds(partnerOrganisations, "partner organisation");
  assertUniqueIds(teams, "team");
  assertUniqueIds(applications, "application");
  assertUniqueIds(roles, "role");
  assertUniqueIds(entitlements, "entitlement");

  const organisationIds = new Set(partnerOrganisations.map((item) => item.id));
  const teamIds = new Set(teams.map((item) => item.id));
  const applicationIds = new Set(applications.map((item) => item.id));
  const roleIds = new Set(roles.map((item) => item.id));
  for (const user of users) if (user.partnerOrganisationId) assertReference(organisationIds, user.partnerOrganisationId, "partner organisation");
  for (const membership of teamMemberships) {
    assertReference(teamIds, membership.teamId, "membership team");
  }
  for (const role of roles) assertReference(applicationIds, role.applicationId, "role application");
  const roleById = new Map(roles.map((role) => [role.id, role]));
  for (const entitlement of entitlements) {
    assertReference(applicationIds, entitlement.applicationId, "entitlement application");
    assertReference(roleIds, entitlement.roleId, "entitlement role");
    if (roleById.get(entitlement.roleId)?.applicationId !== entitlement.applicationId) {
      throw new Error("Access policy entitlement role belongs to a different application.");
    }
    if (entitlement.subject.type === "team") assertReference(teamIds, entitlement.subject.teamId, "entitlement team");
    for (const organisationId of entitlement.scope?.partnerOrganisationIds ?? []) {
      if (!UUID.test(organisationId)) throw new Error("Access policy scope contains an invalid partner organisation ID.");
      assertReference(organisationIds, organisationId, "scope partner organisation");
    }
  }

  return { users, partnerOrganisations, teams, teamMemberships, applications, roles, entitlements };
}
