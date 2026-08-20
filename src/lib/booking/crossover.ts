// Guest crossover detection for Help Scout notes. A crossover is any other
// active booking by the same guest email — another trip on the same brand,
// or anything on a sister brand. Each BM involved gets told before anyone
// reaches out, so the guest never fields two uncoordinated calls.
//
// Pure composition lives here (unit-tested); the SQL that finds crossovers
// and the Help Scout delivery live in service.ts.

import { DateTime } from "luxon";

export type CrossoverBooking = {
  bookingId: string;
  startsAtIso: string;
  eventTypeName: string;
  brandKey: string;
  brandName: string;
  staffFullName: string;
  staffEmail: string;
  tripSlug: string | null;
  helpscoutConversationId: string | null;
};

export type CrossoverContext = {
  guestName: string;
  brandKey: string;
  brandName: string;
  staffFullName: string;
  eventTypeName: string;
  startsAtIso: string;
  tripSlug: string | null;
  /** Zone the times are rendered in (the viewing BM's brand market). */
  timezone: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso: string, zone: string): string {
  const dt = DateTime.fromISO(iso, { zone });
  return dt.isValid ? dt.toFormat("ccc d LLL, h:mma").toLowerCase() : iso;
}

/** How this crossover relates to the booking being viewed. */
export function crossoverRelation(row: CrossoverBooking, ctx: { brandKey: string; tripSlug: string | null }): string {
  if (row.brandKey !== ctx.brandKey) return "different brand";
  if (row.tripSlug && ctx.tripSlug && row.tripSlug !== ctx.tripSlug) return "same brand, different trip";
  if (row.tripSlug === ctx.tripSlug && row.tripSlug !== null) return "same trip";
  return "same brand";
}

/**
 * Section appended to the NEW booking's Help Scout note: everything else
 * this guest has in flight, and who owns it.
 */
export function buildCrossoverSectionHtml(crossovers: CrossoverBooking[], ctx: CrossoverContext): string {
  if (crossovers.length === 0) return "";
  const items = crossovers
    .map((row) => {
      const relation = crossoverRelation(row, ctx);
      const trip = row.tripSlug ? ` · trip: ${escapeHtml(row.tripSlug)}` : "";
      return (
        `<li>${escapeHtml(row.brandName)} — ${escapeHtml(row.eventTypeName)} with ` +
        `<strong>${escapeHtml(row.staffFullName)}</strong> ` +
        `(${formatWhen(row.startsAtIso, ctx.timezone)}${trip}) — ${relation}</li>`
      );
    })
    .join("");
  const plural = crossovers.length === 1 ? "booking" : "bookings";
  return (
    `<p><strong>⚠ Guest crossover</strong> — ${escapeHtml(ctx.guestName)} has ` +
    `${crossovers.length} other active ${plural} across Leatherback. ` +
    `Worth a word with the BMs below before reaching out:</p><ul>${items}</ul>`
  );
}

/**
 * Note threaded into EACH existing crossover conversation, so the BM who
 * already owns that guest hears about the new booking too.
 */
export function buildCrossoverPingHtml(ctx: CrossoverContext): string {
  const trip = ctx.tripSlug ? ` (trip: ${escapeHtml(ctx.tripSlug)})` : "";
  return (
    `<p><strong>⚠ Guest crossover</strong> — ${escapeHtml(ctx.guestName)} just booked a ` +
    `${escapeHtml(ctx.eventTypeName)} with <strong>${escapeHtml(ctx.staffFullName)}</strong> at ` +
    `${escapeHtml(ctx.brandName)}${trip}, starting ${formatWhen(ctx.startsAtIso, ctx.timezone)}. ` +
    `They also hold the booking in this conversation — sync with ${escapeHtml(ctx.staffFullName)} ` +
    `before reaching out.</p>`
  );
}
