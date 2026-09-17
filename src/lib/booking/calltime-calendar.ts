// CallTime Cal (Nicola, 17 Sep): the one shared Google calendar every booked
// call lives on, worked the way the team works the HR calendar — one event,
// edited in place for everyone. The Booking Manager taking the call is an
// accepted guest on the event, so it still shows on their own calendar and
// marks them busy; moving a call to another BM is swapping that guest.
//
// The calendar itself is created and shared in Google Calendar by a person
// (the service account's delegation only covers events, not calendars), and
// its id plus the account the app acts as are stored here, set from the
// Integrations page. No row = the legacy arrangement, events on each BM's
// own primary calendar.

import "server-only";

import { getSql } from "./db";

export const CALLTIME_CALENDAR_KEY = "calltime:calendar";

export type CalltimeCalendar = {
  calendarId: string;
  /** The Workspace account the app acts as on the shared calendar — the
   *  calendar's owner, or anyone it is shared with as "make changes". */
  actorEmail: string;
  /** Google's name for the calendar, from the last successful probe. */
  name: string | null;
  /** Last probe outcome, for the Integrations page. */
  checkedAt: string | null;
  lastError: string | null;
};

export async function getCalltimeCalendar(): Promise<CalltimeCalendar | null> {
  const sql = getSql();
  const rows = await sql`select payload from booking.reference_cache where key = ${CALLTIME_CALENDAR_KEY}`;
  const payload = (rows[0]?.payload ?? null) as Partial<CalltimeCalendar> | null;
  if (!payload?.calendarId || !payload.actorEmail) return null;
  return {
    calendarId: payload.calendarId,
    actorEmail: payload.actorEmail,
    name: payload.name ?? null,
    checkedAt: payload.checkedAt ?? null,
    lastError: payload.lastError ?? null,
  };
}

export async function saveCalltimeCalendar(value: CalltimeCalendar | null): Promise<void> {
  const sql = getSql();
  if (!value) {
    await sql`delete from booking.reference_cache where key = ${CALLTIME_CALENDAR_KEY}`;
    return;
  }
  await sql`
    insert into booking.reference_cache (key, payload, fetched_at)
    values (${CALLTIME_CALENDAR_KEY}, ${JSON.stringify(value)}::jsonb, now())
    on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`;
}

export { canMoveBooking, isFloatingBm } from "./calltime-calendar-rules.ts";
