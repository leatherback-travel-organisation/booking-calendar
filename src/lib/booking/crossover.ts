// Guest crossover composition for Help Scout notes. A crossover is an ACTIVE
// LEAD (Booking CRM at Strong Interest or Pending Deposit) held by the same
// guest email — another trip on the same brand, or anything on a sister
// brand. Every BM involved gets told before anyone reaches out, so the guest
// never fields two uncoordinated calls.
//
// Pure composition lives here (unit-tested); the CRM lookup lives in
// leads.ts and the Help Scout delivery in service.ts.

import { DateTime } from "luxon";

export type CrossoverLead = {
  crmRecordId: string;
  /** CRM stage, e.g. "Strong Interest" or "Pending Deposit". */
  status: string;
  tripRecordId: string | null;
  tripTitle: string | null;
  brandName: string | null;
  bmName: string | null;
  bmEmail: string | null;
};

export type CrossoverContext = {
  guestName: string;
  brandName: string;
  staffFullName: string;
  eventTypeName: string;
  startsAtIso: string;
  airtableTripRecordId: string | null;
  /** Zone the booking time is rendered in (the brand's market). */
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

/** How a lead relates to the booking being viewed. */
export function crossoverRelation(lead: CrossoverLead, ctx: CrossoverContext): string {
  if (lead.tripRecordId && ctx.airtableTripRecordId && lead.tripRecordId === ctx.airtableTripRecordId) {
    return "this same trip";
  }
  if (lead.brandName && lead.brandName === ctx.brandName) return "same brand, different trip";
  return "different brand";
}

/**
 * Section appended to the NEW booking's Help Scout note: every active lead
 * this guest holds, and which BM owns it.
 */
export function buildCrossoverSectionHtml(leads: CrossoverLead[], ctx: CrossoverContext): string {
  if (leads.length === 0) return "";
  const items = leads
    .map((lead) => {
      const trip = lead.tripTitle ? escapeHtml(lead.tripTitle) : "trip not recorded";
      const brand = lead.brandName ? ` (${escapeHtml(lead.brandName)})` : "";
      const owner = lead.bmName ? ` — lead with <strong>${escapeHtml(lead.bmName)}</strong>` : "";
      return `<li>${escapeHtml(lead.status)}: ${trip}${brand}${owner} — ${crossoverRelation(lead, ctx)}</li>`;
    })
    .join("");
  const plural = leads.length === 1 ? "lead" : "leads";
  return (
    `<p><strong>⚠ Guest crossover</strong> — ${escapeHtml(ctx.guestName)} holds ` +
    `${leads.length} active ${plural} in the Booking CRM. ` +
    `Worth a word with the BMs below before reaching out:</p><ul>${items}</ul>`
  );
}

/**
 * Body for the heads-up conversation sent to a lead's owning BM: their lead
 * just booked a call elsewhere.
 */
export function buildCrossoverPingHtml(lead: CrossoverLead, ctx: CrossoverContext): string {
  const trip = lead.tripTitle ? ` for ${escapeHtml(lead.tripTitle)}` : "";
  return (
    `<p><strong>⚠ Guest crossover</strong> — ${escapeHtml(ctx.guestName)}, your ` +
    `${escapeHtml(lead.status)} lead${trip}, just booked a ${escapeHtml(ctx.eventTypeName)} with ` +
    `<strong>${escapeHtml(ctx.staffFullName)}</strong> at ${escapeHtml(ctx.brandName)}, ` +
    `starting ${formatWhen(ctx.startsAtIso, ctx.timezone)} (${crossoverRelation(lead, ctx)}). ` +
    `Sync with ${escapeHtml(ctx.staffFullName)} before reaching out.</p>`
  );
}

export function crossoverPingSubject(ctx: CrossoverContext): string {
  return `Crossover: ${ctx.guestName} booked with ${ctx.brandName}`;
}
