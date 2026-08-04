export const COVE_CANONICAL_ORIGIN = "https://cove.leatherbacktravel.com";

export function coveApplicationLaunchUrl(applicationSlug: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(applicationSlug)) {
    throw new Error("A valid Cove application slug is required.");
  }

  const url = new URL("/api/cove/launch", COVE_CANONICAL_ORIGIN);
  url.searchParams.set("applicationSlug", applicationSlug);
  return url.toString();
}

export function canonicalProductionUrl(
  requestUrl: string,
  environment = process.env.VERCEL_ENV,
): URL | null {
  if (environment !== "production") return null;

  const incoming = new URL(requestUrl);
  const canonical = new URL(COVE_CANONICAL_ORIGIN);
  if (incoming.hostname.toLowerCase() === canonical.hostname) return null;

  canonical.pathname = incoming.pathname;
  canonical.search = incoming.search;
  canonical.hash = incoming.hash;
  return canonical;
}
