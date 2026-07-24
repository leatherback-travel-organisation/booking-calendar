import type { Application, ApplicationAccessLevel, IdentityPopulation, PlatformRole, UserStatus } from "./model";

export type AccessDirectoryStatus =
  | "active"
  | "invited"
  | "invitation_expired"
  | "invitation_revoked"
  | "suspended"
  | "deprovisioned";

export type AccessDirectoryPerson = {
  readonly id: string;
  readonly initials: string;
  readonly name: string;
  readonly email: string;
  readonly population: IdentityPopulation;
  readonly status: AccessDirectoryStatus;
  readonly userStatus: UserStatus;
  readonly platformRoles: readonly PlatformRole[];
  readonly applicationAccess: Readonly<Record<string, ApplicationAccessLevel>>;
  readonly lastAuthenticatedAt?: string;
  readonly invitedAt?: string;
  readonly invitationExpiresAt?: string;
};

export type AccessDirectory = {
  readonly people: readonly AccessDirectoryPerson[];
  readonly applications: readonly Application[];
  readonly writable: boolean;
  readonly source: "postgres" | "demo" | "unavailable";
  readonly message?: string;
};

export type AccessActionResult =
  | { readonly ok: true; readonly directory: AccessDirectory; readonly message: string }
  | { readonly ok: false; readonly message: string };
