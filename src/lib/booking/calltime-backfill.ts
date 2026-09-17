// Bring the calls booked BEFORE CallTime Cal existed onto it (Nicola, 17
// Sep: "add all existing calltime scheduled calls in to the shared
// calendar"). Each upcoming confirmed booking whose event still sits on its
// BM's own calendar is moved with Google's events.move, acting as that BM —
// the event keeps its id, its Meet link and the .ics identity the guest
// already has — then the BM is re-attached as an accepted guest so it still
// shows on their own calendar and marks them busy, and the booking row
// records its new home. One at a time, failures recorded and skipped, so a
// bad calendar never blocks the rest.

import "server-only";

import { getSql } from "./db";
import { calendarConfigured } from "./google/auth";
import { moveEvent, patchEvent } from "./google/calendar";
import { getCalltimeCalendar } from "./calltime-calendar";

export const BACKFILL_KEY = "calltime:backfill";

export type BackfillResult = {
  ranAt: string;
  moved: number;
  failed: Array<{ bookingId: string; guest: string; bm: string; error: string }>;
  skipped: number;
};

/** Upcoming confirmed bookings whose event is still on the BM's own calendar. */
export async function countLegacyUpcoming(): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    select count(*)::int as n from booking.booking
    where status = 'confirmed' and starts_at > now()
      and google_event_id is not null and google_calendar_id is null`;
  return Number(rows[0]?.n ?? 0);
}

export async function getLastBackfill(): Promise<BackfillResult | null> {
  const sql = getSql();
  const rows = await sql`select payload from booking.reference_cache where key = ${BACKFILL_KEY}`;
  return (rows[0]?.payload as BackfillResult | undefined) ?? null;
}

export async function backfillSharedCalendar(actor: string): Promise<BackfillResult> {
  const sql = getSql();
  const result: BackfillResult = { ranAt: new Date().toISOString(), moved: 0, failed: [], skipped: 0 };
  const shared = calendarConfigured() ? await getCalltimeCalendar() : null;
  if (!shared) {
    result.failed.push({ bookingId: "-", guest: "-", bm: "-", error: "CallTime Cal is not set up." });
    return result;
  }

  const rows = await sql`
    select b.id, b.google_event_id, b.guest_name, s.email as bm_email, s.full_name as bm_name
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    where b.status = 'confirmed' and b.starts_at > now()
      and b.google_event_id is not null and b.google_calendar_id is null
    order by b.starts_at`;

  for (const row of rows) {
    const bookingId = String(row.id);
    const eventId = String(row.google_event_id);
    const bmEmail = String(row.bm_email);
    const bmName = String(row.bm_name);
    try {
      // As the BM: off their own calendar, onto the shared one.
      await moveEvent(bmEmail, "primary", eventId, shared.calendarId);
      // As the shared actor: the BM becomes an accepted guest again.
      await patchEvent(
        shared.actorEmail,
        eventId,
        { attendees: [{ email: bmEmail, displayName: bmName, responseStatus: "accepted" }] },
        shared.calendarId,
      );
      await sql`
        update booking.booking
           set google_calendar_id = ${shared.calendarId}, google_actor_email = ${shared.actorEmail}
         where id = ${bookingId}`;
      result.moved += 1;
    } catch (error) {
      result.failed.push({
        bookingId,
        guest: String(row.guest_name),
        bm: bmName,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
    // Gentle on Google's per-user quota.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await sql`
    insert into booking.reference_cache (key, payload, fetched_at)
    values (${BACKFILL_KEY}, ${JSON.stringify(result)}::jsonb, now())
    on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`;
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${actor}, 'calltime_calendar_backfill', 'calltime:calendar',
            ${JSON.stringify({ moved: result.moved, failed: result.failed.length })}::jsonb)`;
  return result;
}
