import type { PublicEventType } from "./types";

/**
 * What a booking link opens on.
 *
 * An explicit ?type= always wins — Booking Managers pick the right link for
 * their day-to-day work. Otherwise the brand's default decides: online brands
 * (Salt Caravan, Carex) open a Quick Chat, adventure brands the 30-minute
 * Trip Enquiry (Nicola, 14 Sep). Every brand row names one (067/068); the
 * "enquiry, else first" tail is only a safety net for a row that lost it.
 * Guests are never shown the choice.
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
