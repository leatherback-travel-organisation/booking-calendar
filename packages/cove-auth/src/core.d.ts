export const COVE_AUTH_VERSION: "1.1.0";
export const COVE_ACCESS_PROTOCOL: "leatherback.cove-access/v1";
export const COVE_HEALTH_PROTOCOL: "leatherback.cove-auth.health/v1";
export const COVE_ROLES: readonly ["user", "admin"];

export type CoveRole = "user" | "admin";
export type CoveApplicationReference =
  | string
  | { applicationId: string; applicationSlug?: never; slug?: never }
  | { applicationId?: never; applicationSlug: string; slug?: never }
  | { applicationId?: never; applicationSlug?: never; slug: string };
export type NormalizedCoveApplicationReference = { applicationId: string } | { applicationSlug: string };
export type CoveAccessGrant = {
  allowed: true;
  application: { id: string; slug: string; name: string };
  user: { id: string };
  role: CoveRole;
  permissions: string[];
  checkedAt: string;
};
export type CoveAccessDenial = { allowed: false; code: string; message: string };

export function normalizeRole(role?: string): CoveRole;
export function applicationById(applicationId: string): { applicationId: string };
export function applicationBySlug(applicationSlug: string): { applicationSlug: string };
export function normalizeApplicationReference(reference: CoveApplicationReference): NormalizedCoveApplicationReference;
export function roleSatisfies(actualRole: CoveRole, requiredRole: CoveRole): boolean;
export function buildAccessRequestBody(application: CoveApplicationReference, requiredRole?: CoveRole): NormalizedCoveApplicationReference & { requiredRole: CoveRole };
export function resolveAccessApiUrl(env?: Record<string, string | undefined>): string;
export function assertAccessApiUrl(value: string, label?: string): string;
export function parseAccessDecision(payload: unknown, requiredRole?: CoveRole): CoveAccessGrant | CoveAccessDenial;
export function cleanString(value: unknown): string | undefined;
export function assertHttpUrl(value: string, label?: string): string;
