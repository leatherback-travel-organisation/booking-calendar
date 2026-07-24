type GoogleAccountCandidate = {
  provider?: string | null;
  emailAddress?: string | null;
  verification?: { status?: string | null } | null;
};

const VERIFIED_GOOGLE_PROVIDERS = new Set(["google", "oauth_google"]);

/**
 * Clerk's frontend and backend resources use different provider labels for
 * the same Google OAuth connection. Access still requires the matching email
 * and a verified external account; the provider label alone is never enough.
 */
export function isVerifiedGoogleAccount(
  account: GoogleAccountCandidate,
  expectedEmail: string,
) {
  const provider = account.provider?.trim().toLowerCase();
  const email = account.emailAddress?.trim().toLowerCase();

  return Boolean(
    provider &&
    VERIFIED_GOOGLE_PROVIDERS.has(provider) &&
    email === expectedEmail.trim().toLowerCase() &&
    account.verification?.status === "verified"
  );
}
