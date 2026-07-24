type IdentityModeEnvironment = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  COVE_PREVIEW_MODE?: string;
};

/**
 * Demo identities are strictly a local-development and Vercel-preview feature.
 * The canonical production deployment must always use Clerk and live data.
 */
export function isPreviewIdentityEnabled(environment: IdentityModeEnvironment = process.env) {
  if (environment.VERCEL_ENV === "production") return false;
  if (environment.VERCEL_ENV === "preview") return true;
  if (environment.NODE_ENV === "production") return false;
  return environment.COVE_PREVIEW_MODE === "true";
}
