// Group sessions: a BM publishes a session, guests claim seats. One Google
// event on the BM's calendar blocks the time; guests are NEVER added as
// Google attendees — attendee lists are visible to all attendees, and
// disclosing twelve guests' emails to each other is a privacy incident
// (worse still for a women-only brand). Each guest gets their own branded
// email with the Meet link instead (§8.2).

import "server-only";

import { getSql } from "./db";
import { sendBookingAlert } from "./alerts";
import { calendarConfigured } from "./google/auth";
import { deleteEvent, insertEvent } from "./google/calendar";
import type { Brand, EventType, Staff } from "./model";
import { resolveSchedulingZone } from "./availability/engine";
import { sendBookingEmail } from "./notify/messages";
import { issueToken } from "./tokens";
import { appUrl } from "./app-url";

export type GroupSession = {
  id: string;
  staffId: string;
  eventTypeId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  seatsTaken: number;
  meetUrl: string | null;
  googleEventId: string | null;
  status: "open" | "full" | "cancelled" | "held";
};

function mapSession(row: Record<string, unknown>): GroupSession {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    eventTypeId: String(row.event_type_id),
    startsAt: new Date(row.starts_at as string).toISOString(),
    endsAt: new Date(row.ends_at as string).toISOString(),
    capacity: Number(row.capacity),
    seatsTaken: Number(row.seats_taken),
    meetUrl: (row.meet_url as string | null) ?? null,
    googleEventId: (row.google_event_id as string | null) ?? null,
    status: row.status as GroupSession["status"],
  };
}

export async function getSession(id: string): Promise<GroupSession | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.group_session where id = ${id}`;
  return rows.length ? mapSession(rows[0]) : null;
}

export async function listOpenSessions(staffId?: string): Promise<GroupSession[]> {
  const sql = getSql();
  const rows = staffId
    ? await sql`select * from booking.group_session where status in ('open','full') and starts_at > now() and staff_id = ${staffId} order by starts_at`
    : await sql`select * from booking.group_session where status in ('open','full') and starts_at > now() order by starts_at`;
  return rows.map(mapSession);
}

export async function createGroupSession(args: {
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  startIso: string;
  capacity: number;
  actorEmail: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; reason: "calendar_failed" | "invalid" }> {
  const sql = getSql();
  const start = new Date(args.startIso);
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now() || args.capacity < 1) {
    return { ok: false, reason: "invalid" };
  }
  const endIso = new Date(start.getTime() + args.eventType.durationMin * 60_000).toISOString();
  const startIso = start.toISOString();

  const rows = await sql`
    insert into booking.group_session (staff_id, event_type_id, starts_at, ends_at, capacity)
    values (${args.staff.id}, ${args.eventType.id}, ${startIso}, ${endIso}, ${args.capacity})
    returning id`;
  const sessionId = String(rows[0].id);

  // The single Google event blocks the BM's time so no 1:1 lands on top of
  // it (free/busy shows it as busy). Only the BM is on the event.
  if (calendarConfigured()) {
    try {
      const event = await insertEvent(args.staff.email, {
        summary: `${args.eventType.name} (group) — ${args.capacity} seats`,
        description: `Group session. Seat roster: ${appUrl()}/booking?session=${sessionId}`,
        startIso,
        endIso,
        timezone: resolveSchedulingZone(args.staff, args.brand),
        conferenceRequestId: sessionId,
        privateProperties: { groupSessionId: sessionId },
      });
      await sql`
        update booking.group_session
        set google_event_id = ${event.id}, meet_url = ${event.meetUrl}
        where id = ${sessionId}`;
    } catch (error) {
      await sql`update booking.group_session set status = 'cancelled' where id = ${sessionId}`;
      await sendBookingAlert(
        `group-google-failed:${sessionId}`,
        `Group session ${sessionId} for ${args.staff.fullName} failed at Google event creation: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return { ok: false, reason: "calendar_failed" };
    }
  }

  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${args.actorEmail}, 'group_session_created', ${sessionId}, ${JSON.stringify({
      staff: args.staff.email,
      startIso,
      capacity: args.capacity,
    })}::jsonb)`;
  return { ok: true, sessionId };
}

export type ClaimSeatResult =
  | { ok: true; bookingId: string; manageUrl: string; meetUrl: string | null }
  | { ok: false; reason: "session_full" | "session_closed" };

/**
 * Seat claiming uses an atomic conditional update — the exclusion constraint
 * deliberately does not apply to group seats (they share a time on purpose),
 * so the seats_taken guard IS the race protection (§8.3). Zero rows updated
 * means the session filled between render and submit.
 */
export async function claimSeat(args: {
  session: GroupSession;
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  guestTimezone?: string | null;
  idempotencyKey: string;
  appUrl: string;
}): Promise<ClaimSeatResult> {
  const sql = getSql();

  // Idempotent double-submit first.
  const existing = await sql`
    select id, meet_url from booking.booking where idempotency_key = ${args.idempotencyKey}`;
  if (existing.length > 0) {
    return {
      ok: true,
      bookingId: String(existing[0].id),
      manageUrl: `${args.appUrl}/manage/already-sent`,
      meetUrl: (existing[0].meet_url as string | null) ?? null,
    };
  }

  const claimed = await sql`
    update booking.group_session
       set seats_taken = seats_taken + 1,
           status = case when seats_taken + 1 >= capacity then 'full' else 'open' end
     where id = ${args.session.id} and seats_taken < capacity and status = 'open'
    returning seats_taken`;
  if (claimed.length === 0) {
    const current = await getSession(args.session.id);
    return { ok: false, reason: current && current.status === "open" ? "session_full" : "session_closed" };
  }

  const token = issueToken();
  let bookingId: string;
  try {
    const rows = await sql`
      insert into booking.booking (
        staff_id, brand_id, event_type_id, group_session_id, starts_at, ends_at,
        guest_timezone, guest_name, guest_email, guest_phone,
        source_kind, routed_via, meet_url, manage_token_hash, idempotency_key, confirmed_at
      ) values (
        ${args.staff.id}, ${args.brand.id}, ${args.eventType.id}, ${args.session.id},
        ${args.session.startsAt}, ${args.session.endsAt},
        ${args.guestTimezone ?? null}, ${args.guestName}, ${args.guestEmail.trim().toLowerCase()},
        ${args.guestPhone ?? null},
        'session', 'primary', ${args.session.meetUrl}, ${token.hash}, ${args.idempotencyKey}, now()
      )
      returning id`;
    bookingId = String(rows[0].id);
  } catch (error) {
    // Release the seat we claimed — the booking row did not materialise.
    await sql`
      update booking.group_session
         set seats_taken = greatest(seats_taken - 1, 0),
             status = case when status = 'full' then 'open' else status end
       where id = ${args.session.id}`;
    throw error;
  }

  const manageUrl = `${args.appUrl}/manage/${token.raw}`;
  try {
    await sendBookingEmail("confirmation", {
      bookingId,
      guestName: args.guestName,
      guestEmail: args.guestEmail,
      guestTimezone: args.guestTimezone ?? null,
      startIso: args.session.startsAt,
      endIso: args.session.endsAt,
      durationMin: args.eventType.durationMin,
      meetUrl: args.session.meetUrl,
      manageUrlRaw: manageUrl,
      brand: args.brand,
      staff: args.staff,
      eventType: args.eventType,
    });
  } catch (error) {
    await sendBookingAlert(
      `group-confirmation-failed:${bookingId}`,
      `Seat confirmed on session ${args.session.id} but the email failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values ('guest', 'group_seat_claimed', ${bookingId}, ${JSON.stringify({ sessionId: args.session.id })}::jsonb)`;
  return { ok: true, bookingId, manageUrl, meetUrl: args.session.meetUrl };
}

export async function cancelGroupSession(args: {
  session: GroupSession;
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  actorEmail: string;
}): Promise<{ ok: boolean; guestsNotified: number }> {
  const sql = getSql();
  const rows = await sql`
    update booking.group_session set status = 'cancelled'
    where id = ${args.session.id} and status in ('open', 'full')
    returning id`;
  if (rows.length === 0) return { ok: false, guestsNotified: 0 };

  if (args.session.googleEventId && calendarConfigured()) {
    try {
      await deleteEvent(args.staff.email, args.session.googleEventId);
    } catch (error) {
      await sendBookingAlert(
        `group-google-delete-failed:${args.session.id}`,
        `Cancelled session ${args.session.id} but its Google event survived: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  const seats = await sql`
    update booking.booking
       set status = 'cancelled', cancelled_at = now(), cancelled_by = 'bm',
           ical_sequence = ical_sequence + 1
     where group_session_id = ${args.session.id} and status = 'confirmed'
    returning *`;

  let notified = 0;
  for (const row of seats) {
    try {
      await sendBookingEmail("cancellation", {
        bookingId: String(row.id),
        guestName: String(row.guest_name),
        guestEmail: String(row.guest_email),
        guestTimezone: (row.guest_timezone as string | null) ?? null,
        startIso: new Date(row.starts_at as string).toISOString(),
        endIso: new Date(row.ends_at as string).toISOString(),
        durationMin: args.eventType.durationMin,
        meetUrl: null,
        manageUrlRaw: "",
        brand: args.brand,
        staff: args.staff,
        eventType: args.eventType,
        icalSequence: Number(row.ical_sequence ?? 1),
      });
      notified += 1;
    } catch {
      // Alert once for the batch below.
    }
  }
  if (notified < seats.length) {
    await sendBookingAlert(
      `group-cancel-emails:${args.session.id}`,
      `Session ${args.session.id} cancelled; ${seats.length - notified} of ${seats.length} guest cancellation emails failed.`,
    );
  }
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${args.actorEmail}, 'group_session_cancelled', ${args.session.id}, ${JSON.stringify({ seats: seats.length })}::jsonb)`;
  return { ok: true, guestsNotified: notified };
}
