export type Id = string;

export type IdentityPopulation = "employee" | "external_partner";

export type UserStatus = "active" | "suspended" | "deprovisioned";

export type PlatformRole =
  | "super_admin"
  | "access_admin"
  | "systems_admin"
  | "application_admin"
  | "finance_admin"
  | "people_admin"
  | "auditor";

export type ApplicationRisk = "standard" | "sensitive" | "restricted";

export type ApplicationAccessLevel = "user" | "admin";
export type EmployeeAccessPolicy = "selected" | "all";

export interface VerifiedIdentity {
  /** Immutable subject from the identity provider. Never use email as the key. */
  readonly subject: string;
  readonly issuer: string;
  readonly population: IdentityPopulation;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly verifiedAt: string;
  readonly workspaceDomain?: string;
  readonly sessionId?: string;
}

export interface User {
  readonly id: Id;
  readonly identitySubject: string;
  readonly identityIssuer: string;
  readonly population: IdentityPopulation;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly workspaceDomain?: string;
  readonly partnerOrganisationId?: Id;
  readonly platformRoles: readonly PlatformRole[];
  readonly sessionVersion: number;
}

export interface PartnerOrganisation {
  readonly id: Id;
  readonly name: string;
  readonly status: "active" | "suspended";
}

export interface Team {
  readonly id: Id;
  readonly name: string;
  readonly description: string;
  readonly status: "active" | "archived";
}

export interface TeamMembership {
  readonly teamId: Id;
  readonly userId: Id;
  readonly startsAt?: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
}

export interface Application {
  readonly id: Id;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly launchUrl: string;
  readonly repository?: {
    readonly path: string;
    readonly href: string;
  };
  readonly owner: string;
  readonly status: "active" | "maintenance" | "retired";
  readonly risk: ApplicationRisk;
  readonly allowedPopulations: readonly IdentityPopulation[];
  /** Present in administrative views; `all` is managed as a company-wide policy. */
  readonly employeeAccessPolicy?: EmployeeAccessPolicy;
}

export interface ApplicationRole {
  readonly id: Id;
  readonly applicationId: Id;
  readonly key: string;
  readonly name: string;
  /** User and Admin are the two provisions surfaced consistently for every app. */
  readonly level: ApplicationAccessLevel;
  readonly permissions: readonly string[];
  readonly allowedPopulations: readonly IdentityPopulation[];
}

export interface EntitlementScope {
  /** Used for partner-facing records such as supplier organisations. */
  readonly partnerOrganisationIds?: readonly Id[];
  /** Reserved for trusted internal roles; external identities can never use it. */
  readonly allPartnerOrganisations?: boolean;
}

export interface Entitlement {
  readonly id: Id;
  readonly applicationId: Id;
  readonly roleId: Id;
  readonly subject:
    | { readonly type: "user"; readonly userId: Id }
    | { readonly type: "team"; readonly teamId: Id };
  readonly scope?: EntitlementScope;
  readonly startsAt?: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly revokedReason?: string;
  readonly grantedByUserId: Id;
  readonly grantedAt: string;
}

export interface AuditEvent {
  readonly id: Id;
  readonly occurredAt: string;
  readonly action: string;
  readonly outcome: "success" | "denied" | "error";
  readonly actorUserId?: Id;
  readonly actorIdentitySubject?: string;
  readonly applicationId?: Id;
  readonly targetType?: "user" | "team" | "application" | "entitlement" | "session";
  readonly targetId?: Id;
  readonly requestId?: string;
  /** Metadata must already be redacted. Tokens, secrets and raw PII are forbidden. */
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AccessSnapshot {
  readonly users: readonly User[];
  readonly partnerOrganisations: readonly PartnerOrganisation[];
  readonly teams: readonly Team[];
  readonly teamMemberships: readonly TeamMembership[];
  readonly applications: readonly Application[];
  readonly roles: readonly ApplicationRole[];
  readonly entitlements: readonly Entitlement[];
}

export type AccessDenialReason =
  | "identity_missing"
  | "identity_unverified"
  | "identity_mismatch"
  | "evaluation_time_invalid"
  | "user_not_found"
  | "user_inactive"
  | "application_not_found"
  | "application_inactive"
  | "population_not_allowed"
  | "partner_organisation_inactive"
  | "no_active_entitlement"
  | "role_invalid"
  | "role_population_mismatch"
  | "scope_mismatch"
  | "permission_missing";

export interface AccessGrant {
  readonly allowed: true;
  readonly user: User;
  readonly application: Application;
  readonly roleIds: readonly Id[];
  readonly roleKeys: readonly string[];
  readonly permissions: readonly string[];
  readonly entitlementIds: readonly Id[];
  readonly scope: EntitlementScope;
}

export interface AccessDenial {
  readonly allowed: false;
  readonly reason: AccessDenialReason;
}

export type AccessDecision = AccessGrant | AccessDenial;
