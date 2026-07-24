import type { CoveAccessGrant, CoveApplicationReference, CoveRole } from "./core.js";
import type { CoveAuthError } from "./errors.js";

export type RequireCoveAccessOptions = {
  accessApiUrl?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  auth?: () => Promise<{
    userId: string | null;
    getToken(): Promise<string | null>;
    redirectToSignIn(params?: { returnBackUrl?: string | URL | null }): never;
  }>;
};
export function requireCoveAccess(application: CoveApplicationReference, requiredRole?: CoveRole, options?: RequireCoveAccessOptions): Promise<CoveAccessGrant>;
export function resolveCoveAccess(application: CoveApplicationReference, requiredRole?: CoveRole, options?: RequireCoveAccessOptions): Promise<{ ok: true; access: CoveAccessGrant } | { ok: false; error: CoveAuthError }>;
export function redirectToCoveSignIn(returnBackUrl: string | URL, options?: Pick<RequireCoveAccessOptions, "auth">): Promise<never>;
export function coveAccessErrorResponse(error: unknown): Response;
export function withCoveRouteAccess<Context, Result extends Response>(
  application: CoveApplicationReference,
  requiredRole: CoveRole,
  handler: (request: Request, context: Context, access: CoveAccessGrant) => Result | Promise<Result>,
  options?: RequireCoveAccessOptions,
): (request: Request, context: Context) => Promise<Response>;
export function withCoveServerActionAccess<Args extends unknown[], Result>(
  application: CoveApplicationReference,
  requiredRole: CoveRole,
  action: (access: CoveAccessGrant, ...args: Args) => Result | Promise<Result>,
  options?: RequireCoveAccessOptions,
): (...args: Args) => Promise<Result>;

export * from "./errors.js";
