// READ-ONLY lookup of a guest's active leads in the Airtable Booking CRM.
// An "active lead" is a CRM row at Strong Interest or Pending Deposit — the
// stages where a BM is about to reach out. Used by the crossover flag when a
// booking is created; always best-effort, never blocks the booking.

import "server-only";

import { getSql } from "./db";

const AIRTABLE_API = "https://api.airtable.com/v0";
const BOOKING_BASE_ID = "appnRSV0g89whVidp";
const CRM_TABLE = "Booking CRM";

export const ACTIVE_LEAD_STATUSES = ["Strong Interest", "Pending Deposit"] as const;

export type ActiveLeadRecord = {
  crmRecordId: string;
  status: string;
  tripRecordIds: string[];
};

/**
 * Live CRM query by guest email (matches the Customers email lookup and the
 * direct D-Email field). Case-insensitive; returns only active-stage leads.
 */
export async function findActiveLeads(guestEmail: string): Promise<ActiveLeadRecord[]> {
  const token = process.env.AIRTABLE_BOOKING_TOKEN?.trim();
  if (!token) return [];
  // Emails are zod-validated upstream; strip quotes anyway so the formula
  // can never be broken out of.
  const needle = guestEmail.trim().toLowerCase().replace(/["'\\]/g, "");
  const statusClause = ACTIVE_LEAD_STATUSES.map((status) => `{Status}='${status}'`).join(",");
  const formula =
    `AND(OR(${statusClause}),` +
    `OR(LOWER({D-Email}&'')='${needle}',FIND('${needle}',LOWER(ARRAYJOIN({Email})&''))))`;

  const params = new URLSearchParams({ filterByFormula: formula, pageSize: "50" });
  for (const field of ["Status", "Trips"]) params.append("fields[]", field);

  const leads: ActiveLeadRecord[] = [];
  let offset: string | null = null;
  do {
    if (offset) params.set("offset", offset);
    const response = await fetch(
      `${AIRTABLE_API}/${BOOKING_BASE_ID}/${encodeURIComponent(CRM_TABLE)}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Airtable CRM lookup failed (${response.status})`);
    const payload = (await response.json()) as {
      records?: Array<{ id: string; fields?: Record<string, unknown> }>;
      offset?: string;
    };
    for (const record of payload.records ?? []) {
      const fields = record.fields ?? {};
      leads.push({
        crmRecordId: record.id,
        status: typeof fields["Status"] === "string" ? (fields["Status"] as string) : "",
        tripRecordIds: Array.isArray(fields["Trips"]) ? (fields["Trips"] as string[]) : [],
      });
    }
    offset = payload.offset ?? null;
  } while (offset);

  return leads;
}

export type LeadTripContext = {
  tripRecordId: string | null;
  tripTitle: string | null;
  brandName: string | null;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
};

/**
 * Resolve a lead's trips to titles, brands and coordinating BMs using the
 * reference cache (already synced from Airtable every 15 minutes) — no extra
 * API calls at booking time.
 */
export async function resolveLeadTrips(tripRecordIds: string[]): Promise<LeadTripContext[]> {
  if (tripRecordIds.length === 0) {
    return [{ tripRecordId: null, tripTitle: null, brandName: null, coordinatorName: null, coordinatorEmail: null }];
  }
  const sql = getSql();
  const rows = await sql`
    select key, payload from booking.reference_cache
    where key in ('airtable:trips', 'airtable:booking-managers')`;
  type RawRecord = { id: string; fields?: Record<string, unknown> };
  const byKey = new Map(rows.map((row) => [String(row.key), (row.payload ?? []) as RawRecord[]]));
  const trips = new Map((byKey.get("airtable:trips") ?? []).map((record) => [record.id, record.fields ?? {}]));
  const managers = new Map(
    (byKey.get("airtable:booking-managers") ?? []).map((record) => [record.id, record.fields ?? {}]),
  );

  const first = (value: unknown): string | null => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
    return null;
  };

  return tripRecordIds.map((tripId) => {
    const trip = trips.get(tripId);
    const coordinatorId = trip ? first(trip["Trip Coordinator"]) : null;
    const coordinator = coordinatorId ? managers.get(coordinatorId) : undefined;
    return {
      tripRecordId: tripId,
      tripTitle: trip ? first(trip["Trip Title & Code"]) ?? first(trip["Trip Name"]) : null,
      brandName: trip ? first(trip["Brand"]) : null,
      coordinatorName: coordinator ? first(coordinator["Name"]) : null,
      coordinatorEmail: coordinator ? first(coordinator["Email"]) : null,
    };
  });
}
