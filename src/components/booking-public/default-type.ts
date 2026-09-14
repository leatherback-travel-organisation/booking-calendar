import type { PublicEventType } from "./types";

/**
 * What a booking link opens on.
 *
 * An explicit ?type= always wins. Otherwise the brand may name its own
 * default: the online brands (Salt Caravan, Carex) open a Quick Chat rather
 * than the 30-minute Trip Inquiry (Nicola, 14 Sep). Keeping that on the brand
 * record means it holds for links we did not build — a brand's website, an
 * email, a link already out in the wild — instead of having to be repeated in
 * each site's own code. A brand naming no default keeps the old behaviour.
 *
 * A default the brand does not actually offer is ignored rather than shown
 * broken, so removing a call type can never strand a link.
 */
export function defaultEventTypeKey(
  eventTypes: PublicEventType[],
  typeParam: string | null,
  brandDefault: string | null = null,
): string | null {
  if (typeParam && eventTypes.some((t) => t.key === typeParam)) return typeParam;
  if (brandDefault && eventTypes.some((t) => t.key === brandDefault)) return brandDefault;
  if (eventTypes.some((t) => t.key === "enquiry")) return "enquiry";
  return eventTypes[0]?.key ?? null;
}
