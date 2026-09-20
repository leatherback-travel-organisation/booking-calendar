// Country dial codes for the guest phone field. Guests type their national
// number; the submitted value is standardised to E.164 (+61412345678) so
// AirCall and SMS always get a dialable number. Examples are national
// formats WITHOUT the leading trunk zero, matching what the guest should
// type next to the code.
//
// Curated list: the markets guests actually book from, pinned first, then
// a broad alphabetical sweep. Not exhaustive on purpose — "Other" lets any
// guest type a full international number themselves.

export type DialCountry = {
  iso: string;
  name: string;
  dial: string;
  /** National example, no trunk zero — shown as the input placeholder. */
  example: string;
  /** How many digits a national number has after the dial code, [min, max]. */
  digits: [number, number];
};

export const PINNED: DialCountry[] = [
  { iso: "AU", name: "Australia", dial: "61", example: "412 345 678", digits: [8, 10] },
  { iso: "NZ", name: "New Zealand", dial: "64", example: "21 123 4567", digits: [8, 10] },
  { iso: "US", name: "United States", dial: "1", example: "201 555 0123", digits: [10, 10] },
  { iso: "GB", name: "United Kingdom", dial: "44", example: "7911 123456", digits: [9, 10] },
  { iso: "CA", name: "Canada", dial: "1", example: "204 555 0123", digits: [10, 10] },
];

export const REST: DialCountry[] = [
  { iso: "AT", name: "Austria", dial: "43", example: "664 123456", digits: [8, 13] },
  { iso: "BE", name: "Belgium", dial: "32", example: "470 12 34 56", digits: [8, 9] },
  { iso: "BR", name: "Brazil", dial: "55", example: "11 96123 4567", digits: [10, 11] },
  { iso: "CH", name: "Switzerland", dial: "41", example: "78 123 45 67", digits: [9, 9] },
  { iso: "CL", name: "Chile", dial: "56", example: "9 6123 4567", digits: [9, 9] },
  { iso: "CN", name: "China", dial: "86", example: "131 2345 6789", digits: [10, 11] },
  { iso: "DE", name: "Germany", dial: "49", example: "1512 3456789", digits: [8, 12] },
  { iso: "DK", name: "Denmark", dial: "45", example: "20 12 34 56", digits: [8, 8] },
  { iso: "ES", name: "Spain", dial: "34", example: "612 34 56 78", digits: [9, 9] },
  { iso: "FI", name: "Finland", dial: "358", example: "41 2345678", digits: [8, 11] },
  { iso: "FR", name: "France", dial: "33", example: "6 12 34 56 78", digits: [9, 9] },
  { iso: "GR", name: "Greece", dial: "30", example: "691 234 5678", digits: [10, 10] },
  { iso: "HK", name: "Hong Kong", dial: "852", example: "5123 4567", digits: [8, 8] },
  { iso: "ID", name: "Indonesia", dial: "62", example: "812 345 678", digits: [8, 12] },
  { iso: "IE", name: "Ireland", dial: "353", example: "85 012 3456", digits: [8, 9] },
  { iso: "IL", name: "Israel", dial: "972", example: "50 123 4567", digits: [8, 9] },
  { iso: "IN", name: "India", dial: "91", example: "81234 56789", digits: [10, 10] },
  { iso: "IT", name: "Italy", dial: "39", example: "312 345 6789", digits: [8, 11] },
  { iso: "JP", name: "Japan", dial: "81", example: "90 1234 5678", digits: [9, 10] },
  { iso: "KR", name: "South Korea", dial: "82", example: "10 1234 5678", digits: [8, 10] },
  { iso: "MX", name: "Mexico", dial: "52", example: "222 123 4567", digits: [10, 10] },
  { iso: "MY", name: "Malaysia", dial: "60", example: "12 345 6789", digits: [8, 10] },
  { iso: "NL", name: "Netherlands", dial: "31", example: "6 12345678", digits: [9, 9] },
  { iso: "NO", name: "Norway", dial: "47", example: "406 12 345", digits: [8, 8] },
  { iso: "PH", name: "Philippines", dial: "63", example: "917 123 4567", digits: [10, 10] },
  { iso: "PL", name: "Poland", dial: "48", example: "512 345 678", digits: [9, 9] },
  { iso: "PT", name: "Portugal", dial: "351", example: "912 345 678", digits: [9, 9] },
  { iso: "SE", name: "Sweden", dial: "46", example: "70 123 45 67", digits: [8, 10] },
  { iso: "SG", name: "Singapore", dial: "65", example: "8123 4567", digits: [8, 8] },
  { iso: "TH", name: "Thailand", dial: "66", example: "81 234 5678", digits: [8, 9] },
  { iso: "TR", name: "Türkiye", dial: "90", example: "501 234 5678", digits: [10, 10] },
  { iso: "TW", name: "Taiwan", dial: "886", example: "912 345 678", digits: [8, 9] },
  { iso: "VN", name: "Vietnam", dial: "84", example: "91 234 56 78", digits: [9, 10] },
  { iso: "ZA", name: "South Africa", dial: "27", example: "71 123 4567", digits: [9, 9] },
];

/** "Other": the guest types the full number, + and all. */
export const OTHER_ISO = "XX";

export function dialCountries(): DialCountry[] {
  return [...PINNED, ...REST];
}

export function findCountry(iso: string): DialCountry | null {
  return dialCountries().find((c) => c.iso === iso) ?? null;
}

/** Best-guess default from the browser locale region ("en-AU" → AU). */
export function defaultIso(locale: string | undefined): string {
  const region = locale?.split("-")[1]?.toUpperCase();
  return region && dialCountries().some((c) => c.iso === region) ? region : "AU";
}

/**
 * Which dial-code entry to preselect for a guest whose country the edge
 * header named. A listed country is picked outright; a real country that
 * is NOT in the curated list gets "Other", so the guest types their full
 * international number instead of having Australia quietly assumed for
 * them. No header at all falls back to the browser locale as before.
 */
export function isoForGuestCountry(guestCountry: string | null | undefined, locale: string | undefined): string {
  if (guestCountry && /^[A-Z]{2}$/.test(guestCountry) && guestCountry !== "XX" && guestCountry !== "T1") {
    return findCountry(guestCountry) ? guestCountry : OTHER_ISO;
  }
  return defaultIso(locale);
}

/** The entry whose dial code starts an E.164 number (longest code wins). */
export function countryForE164(e164: string): DialCountry | null {
  const digits = e164.replace(/^\+/, "");
  let best: DialCountry | null = null;
  for (const c of dialCountries()) {
    if (digits.startsWith(c.dial) && (!best || c.dial.length > best.dial.length)) best = c;
  }
  return best;
}

/**
 * Standardise to E.164: strip separators, drop the national trunk zero,
 * prefix the dial code. "Other" numbers pass through with a + ensured.
 */
export function toE164(iso: string, national: string): string {
  const cleaned = national.replace(/[^\d+]/g, "");
  if (iso === OTHER_ISO) return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  const country = findCountry(iso);
  if (!country) return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  // A guest may paste the full international form into the national box.
  if (cleaned.startsWith(`+${country.dial}`)) return cleaned;
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/^0+/, "");
  return `+${country.dial}${digits}`;
}
