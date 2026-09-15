// Every guest-facing link to a Booking Manager's times, built in one place.
//
// A BM who serves more than one brand has a primary, and /book falls back to
// it when a link carries no ?brand= — so Jax, who runs Carex and Salt
// Caravan, showed Carex branding to Salt Caravan guests through the book
// -again link in their email, the manage page's "Book another time", the
// invite page, and the link BMs copy out of Cove (Nicola, 8 Sep).
//
// brandKey is REQUIRED here on purpose: the type checker now refuses a link
// that would guess the brand, which is what let this spread to four places.

export function bookPath(args: {
  staffSlug: string;
  /** The brand the guest is booking WITH — never inferred from the BM. */
  brandKey: string;
  eventTypeKey?: string | null;
}): string {
  const params = new URLSearchParams({ bm: args.staffSlug, brand: args.brandKey });
  if (args.eventTypeKey) params.set("type", args.eventTypeKey);
  return `/book?${params.toString()}`;
}

/** Absolute form, for emails and anywhere else off-site. */
export function bookUrl(appUrl: string, args: Parameters<typeof bookPath>[0]): string {
  return `${appUrl.replace(/\/$/, "")}${bookPath(args)}`;
}
