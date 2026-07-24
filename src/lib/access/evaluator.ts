import type {
  AccessDecision,
  AccessGrant,
  AccessSnapshot,
  Application,
  Entitlement,
  EntitlementScope,
  TeamMembership,
  User,
  VerifiedIdentity,
} from "./model";

function isActiveWindow(
  item: { startsAt?: string; expiresAt?: string; revokedAt?: string },
  now: Date,
): boolean {
  if (item.revokedAt) return false;

  const startsAt = item.startsAt ? Date.parse(item.startsAt) : undefined;
  const expiresAt = item.expiresAt ? Date.parse(item.expiresAt) : undefined;

  // Bad timestamps are configuration errors and therefore deny access.
  if (startsAt !== undefined && Number.isNaN(startsAt)) return false;
  if (expiresAt !== undefined && Number.isNaN(expiresAt)) return false;
  if (startsAt !== undefined && startsAt > now.getTime()) return false;
  if (expiresAt !== undefined && expiresAt <= now.getTime()) return false;
  return true;
}

function identityMatchesUser(identity: VerifiedIdentity, user: User): boolean {
  if (identity.subject !== user.identitySubject) return false;
  if (identity.issuer !== user.identityIssuer) return false;
  if (identity.population !== user.population) return false;

  if (user.population === "employee") {
    return Boolean(
      identity.workspaceDomain &&
        user.workspaceDomain &&
        identity.workspaceDomain.toLowerCase() === user.workspaceDomain.toLowerCase(),
    );
  }

  // Partner organisation is resolved from SuperPanel's trusted user record,
  // never from identity-provider metadata controlled outside this database.
  return Boolean(user.partnerOrganisationId);
}

function activeTeamIds(
  user: User,
  memberships: readonly TeamMembership[],
  snapshot: AccessSnapshot,
  now: Date,
): Set<string> {
  const activeTeams = new Set(
    snapshot.teams.filter((team) => team.status === "active").map((team) => team.id),
  );

  return new Set(
    memberships
      .filter(
        (membership) =>
          membership.userId === user.id &&
          activeTeams.has(membership.teamId) &&
          isActiveWindow(membership, now),
      )
      .map((membership) => membership.teamId),
  );
}

function entitlementApplies(
  entitlement: Entitlement,
  user: User,
  teamIds: ReadonlySet<string>,
): boolean {
  return entitlement.subject.type === "user"
    ? entitlement.subject.userId === user.id
    : teamIds.has(entitlement.subject.teamId);
}

function scopeAllowsUser(scope: EntitlementScope | undefined, user: User): boolean {
  if (user.population === "employee") return true;
  if (!user.partnerOrganisationId) return false;
  if (scope?.allPartnerOrganisations) return false;
  const organisations = scope?.partnerOrganisationIds ?? [];
  return (
    organisations.length > 0 &&
    organisations.every((organisationId) => organisationId === user.partnerOrganisationId)
  );
}

function mergeScopes(entitlements: readonly Entitlement[], user: User): EntitlementScope {
  if (
    user.population === "employee" &&
    entitlements.some((entitlement) => entitlement.scope?.allPartnerOrganisations)
  ) {
    return { allPartnerOrganisations: true };
  }

  return {
    partnerOrganisationIds: [
      ...new Set(
        entitlements.flatMap((entitlement) => entitlement.scope?.partnerOrganisationIds ?? []),
      ),
    ].sort(),
  };
}

function baseApplicationDecision(
  identity: VerifiedIdentity | null | undefined,
  applicationId: string,
  snapshot: AccessSnapshot,
  now: Date,
  requiredPermission?: string,
): AccessDecision {
  if (Number.isNaN(now.getTime())) {
    return { allowed: false, reason: "evaluation_time_invalid" };
  }
  if (!identity) return { allowed: false, reason: "identity_missing" };
  const verifiedAt = Date.parse(identity.verifiedAt);
  if (
    !identity.emailVerified ||
    Number.isNaN(verifiedAt) ||
    verifiedAt > now.getTime()
  ) {
    return { allowed: false, reason: "identity_unverified" };
  }

  const user = snapshot.users.find(
    (candidate) =>
      candidate.identitySubject === identity.subject &&
      candidate.identityIssuer === identity.issuer,
  );
  if (!user) return { allowed: false, reason: "user_not_found" };
  if (!identityMatchesUser(identity, user)) {
    return { allowed: false, reason: "identity_mismatch" };
  }
  if (user.status !== "active") return { allowed: false, reason: "user_inactive" };

  const application = snapshot.applications.find((candidate) => candidate.id === applicationId);
  if (!application) return { allowed: false, reason: "application_not_found" };
  if (application.status !== "active") {
    return { allowed: false, reason: "application_inactive" };
  }
  if (!application.allowedPopulations.includes(user.population)) {
    return { allowed: false, reason: "population_not_allowed" };
  }

  if (user.population === "external_partner") {
    const organisation = snapshot.partnerOrganisations.find(
      (candidate) => candidate.id === user.partnerOrganisationId,
    );
    if (!organisation || organisation.status !== "active") {
      return { allowed: false, reason: "partner_organisation_inactive" };
    }
  }

  const teamIds = activeTeamIds(user, snapshot.teamMemberships, snapshot, now);
  const activeEntitlements = snapshot.entitlements.filter(
    (entitlement) =>
      entitlement.applicationId === application.id &&
      isActiveWindow(entitlement, now) &&
      entitlementApplies(entitlement, user, teamIds),
  );
  if (activeEntitlements.length === 0) {
    return { allowed: false, reason: "no_active_entitlement" };
  }

  const roleById = new Map(
    snapshot.roles
      .filter((role) => role.applicationId === application.id)
      .map((role) => [role.id, role]),
  );
  if (activeEntitlements.some((entitlement) => !roleById.has(entitlement.roleId))) {
    return { allowed: false, reason: "role_invalid" };
  }

  const populationEntitlements = activeEntitlements.filter((entitlement) =>
    roleById.get(entitlement.roleId)!.allowedPopulations.includes(user.population),
  );
  if (populationEntitlements.length === 0) {
    return { allowed: false, reason: "role_population_mismatch" };
  }

  const scopedEntitlements = populationEntitlements.filter((entitlement) =>
    scopeAllowsUser(entitlement.scope, user)
  );
  if (scopedEntitlements.length === 0) {
    return { allowed: false, reason: "scope_mismatch" };
  }

  const permissionEntitlements = requiredPermission
    ? scopedEntitlements.filter((entitlement) =>
        roleById.get(entitlement.roleId)!.permissions.includes(requiredPermission)
      )
    : scopedEntitlements;
  if (permissionEntitlements.length === 0) {
    return { allowed: false, reason: "permission_missing" };
  }

  // Permissions and scopes are merged from the same entitlement set. This
  // prevents a permission from one role being exercised over another role's
  // broader organisation scope.
  const roles = permissionEntitlements.map(
    (entitlement) => roleById.get(entitlement.roleId)!
  );
  const grant: AccessGrant = {
    allowed: true,
    user,
    application,
    roleIds: [...new Set(roles.map((role) => role.id))].sort(),
    roleKeys: [...new Set(roles.map((role) => role.key))].sort(),
    permissions: [...new Set(roles.flatMap((role) => role.permissions))].sort(),
    entitlementIds: permissionEntitlements.map((entitlement) => entitlement.id).sort(),
    scope: mergeScopes(permissionEntitlements, user),
  };
  return grant;
}

/** Pure, deterministic and fail-closed. Call at the sensitive server boundary. */
export function evaluateEntitlement(input: {
  readonly identity: VerifiedIdentity | null | undefined;
  readonly applicationId: string;
  readonly snapshot: AccessSnapshot;
  readonly now: Date;
  readonly requiredPermission?: string;
}): AccessDecision {
  const decision = baseApplicationDecision(
    input.identity,
    input.applicationId,
    input.snapshot,
    input.now,
    input.requiredPermission,
  );
  return decision;
}

/** Returns only apps whose own server-side entitlement evaluation succeeds. */
export function listAccessibleApplications(input: {
  readonly identity: VerifiedIdentity | null | undefined;
  readonly snapshot: AccessSnapshot;
  readonly now: Date;
}): readonly Application[] {
  return input.snapshot.applications.filter(
    (application) =>
      evaluateEntitlement({
        identity: input.identity,
        applicationId: application.id,
        snapshot: input.snapshot,
        now: input.now,
      }).allowed,
  );
}
