// Trip-slug resolution helpers. Live tour URLs are editorial (a trip named
// "Morocco 15 Days" lives at /tour/fifteen-day-morocco-adventure/), so the
// Airtable `Website URL` field is the source of truth and normalisation is
// only ever a fallback tier. Pure functions — unit tested.

/** Aggressive normalisation applied to BOTH sides before comparing slugs. */
export function slugKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ParsedTourUrl = {
  host: string;
  slug: string;
};

/**
 * Parse an Airtable `Website URL` value into a (host, slug) pair.
 * Tolerates missing protocol, stray whitespace, query strings, and trailing
 * slashes. Returns null for values that carry no usable tour path — those are
 * coverage-map material, never silent drops.
 */
export function parseTourUrl(raw: string | null | undefined): ParsedTourUrl | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  // Tourism Tiger sites use /tour/<slug>/; WeTravel and others differ. Take
  // the last non-empty segment as the slug and keep the host for scoping.
  const slug = segments[segments.length - 1].toLowerCase();
  if (!slug || slug === "tour") return null;
  return { host, slug };
}
