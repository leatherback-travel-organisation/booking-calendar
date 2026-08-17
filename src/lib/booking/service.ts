// Booking lifecycle: create, cancel, reschedule, holds. The order of
// operations is deliberate (§6.4): the Postgres insert IS the transaction —
// the exclusion constraint is the real double-booking guarantee — and the
// Google Calendar write happens strictly afterwards, never inside it.

import "server-only";

import { getSql } from "./db";
import { sendBookingAlert } from "./alerts";
import { calendarConfigured } from "./google/auth";
import { deleteEvent, freeBusy, insertEvent, patchEvent } from "./google/calendar";
import type { Brand, EventType, Interval, Staff } from "./model";
import { computeSlots, resolveSchedulingZone } from "./availability/engine";
import { getConfirmed, getWorkingHours } from "./availability/service";
import { sendBookingEmail } from "./notify/messages";
import { createOrThreadConversation } from "./helpscout";
import { issueToken, manageTokenSecret, parseDerivedManageToken, tokenMatches } from "./tokens";

const HOLD_SECONDS = 120;

type PgError = { code?: string; constraint?: string };

function pgCode(error: unknown): string | undefined {
  return (error as PgError)?.code;
}

export type CreateBookingArgs = {
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  startIso: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  guestNotes?: string | null;
  guestTimezone?: string | null;
  sourceKind: "trip" | "bm" | "contact" | "portal" | "invite";
  sourceSlug?: string | null;
  routedVia?: "primary" | "backup" | "pool";
  routedReason?: string | null;
  airtableTripRecordId?: string | null;
  tripName?: string | null;
  tripUrl?: string | null;
  idempotencyKey: string;
  appUrl: string;
  now?: Date;
};

export type CreateBookingResult =
  | { ok: true; bookingId: string; manageUrl: string; meetUrl: string | null; startIso: string; endIso: string }
  | { ok: false; reason: "slot_taken" | "slot_invalid" | "calendar_failed" };

/**
 * Re-verify the requested slot against FRESH free/busy (no cache — between
 * the picker rendering and the submit, the BM may have accepted a meeting),
 * then insert. 23P01 from the exclusion constraint is the expected, friendly
 * "that time was just taken" path, not an error condition.
 */
export async function createBooking(args: CreateBookingArgs): Promise<CreateBookingResult> {
  const sql = getSql();
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const start = new Date(args.startIso);
  if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) {
    return { ok: false, reason: "slot_invalid" };
  }
  const end = new Date(start.getTime() + args.eventType.durationMin * 60_000);
  const endIso = end.toISOString();
  const startIso = start.toISOString();

  // Fresh verification window: just the day around the requested slot.
  let busy: Interval[] = [];
  if (calendarConfigured()) {
    try {
      const result = await freeBusy(
        args.staff.email,
        [args.staff.email],
        new Date(start.getTime() - 86_400_000).toISOString(),
        new Date(end.getTime() + 86_400_000).toISOString(),
      );
      const fetched = result.busyByEmail.get(args.staff.email.toLowerCase());
      if (!fetched) return { ok: false, reason: "calendar_failed" };
      busy = fetched;
    } catch {
      return { ok: false, reason: "calendar_failed" };
    }
  }

  // NOTE: slot holds are deliberately NOT counted here — the guest booking
  // this slot is usually the very person holding it, and their own hold must
  // not veto their booking. Holds keep the picker honest for other guests;
  // correctness comes from fresh busy data, confirmed bookings, and finally
  // the exclusion constraint.
  const [workingHours, confirmed] = await Promise.all([
    getWorkingHours(args.staff.id),
    getConfirmed(args.staff.id, nowIso, new Date(now.getTime() + args.staff.bookingWindowDays * 86_400_000).toISOString()),
  ]);
  const validSlots = computeSlots({
    schedulingZone: resolveSchedulingZone(args.staff, args.brand),
    workingHours,
    durationMin: args.eventType.durationMin,
    bufferMinutes: args.staff.bufferMinutes,
    minNoticeHours: args.staff.minNoticeHours,
    windowStart: nowIso,
    windowEnd: new Date(now.getTime() + args.staff.bookingWindowDays * 86_400_000).toISOString(),
    now: nowIso,
    busy,
    confirmed,
  });
  if (!validSlots.some((slot) => slot.start === startIso)) {
    // Distinguish "someone beat you to it" from "that was never a slot".
    const wouldBeValidWithoutBusy = computeSlots({
      schedulingZone: resolveSchedulingZone(args.staff, args.brand),
      workingHours,
      durationMin: args.eventType.durationMin,
      bufferMinutes: 0,
      minNoticeHours: args.staff.minNoticeHours,
      windowStart: nowIso,
      windowEnd: new Date(now.getTime() + args.staff.bookingWindowDays * 86_400_000).toISOString(),
      now: nowIso,
      busy: [],
    }).some((slot) => slot.start === startIso);
    return { ok: false, reason: wouldBeValidWithoutBusy ? "slot_taken" : "slot_invalid" };
  }

  const token = issueToken();
  let bookingId: string;
  try {
    const rows = await sql`
      insert into booking.booking (
        staff_id, brand_id, event_type_id, starts_at, ends_at,
        guest_timezone, guest_name, guest_email, guest_phone, guest_notes,
        source_kind, source_slug, routed_via, routed_reason,
        airtable_trip_record_id, manage_token_hash, idempotency_key, confirmed_at
      ) values (
        ${args.staff.id}, ${args.brand.id}, ${args.eventType.id}, ${startIso}, ${endIso},
        ${args.guestTimezone ?? null}, ${args.guestName}, ${args.guestEmail.trim().toLowerCase()},
        ${args.guestPhone ?? null}, ${args.guestNotes ?? null},
        ${args.sourceKind}, ${args.sourceSlug ?? null}, ${args.routedVia ?? "primary"}, ${args.routedReason ?? null},
        ${args.airtableTripRecordId ?? null}, ${token.hash}, ${args.idempotencyKey}, now()
      )
      returning id`;
    bookingId = String(rows[0].id);
  } catch (error) {
    if (pgCode(error) === "23P01") {
      return { ok: false, reason: "slot_taken" };
    }
    if (pgCode(error) === "23505") {
      // Idempotent double-submit: hand back the existing booking. The manage
      // URL cannot be reconstructed (we only store the hash), so re-issue is
      // skipped — the guest already has the original response or email.
      const existing = await sql`
        select id, starts_at, ends_at, meet_url from booking.booking
        where idempotency_key = ${args.idempotencyKey}`;
      if (existing.length > 0) {
        const row = existing[0];
        return {
          ok: true,
          bookingId: String(row.id),
          manageUrl: `${args.appUrl}/manage/already-sent`,
          meetUrl: (row.meet_url as string | null) ?? null,
          startIso: new Date(row.starts_at as string).toISOString(),
          endIso: new Date(row.ends_at as string).toISOString(),
        };
      }
    }
    throw error;
  }

  // Outside any transaction: the Google Calendar write.
  let meetUrl: string | null = null;
  let googleEventId: string | null = null;
  let icalUid: string | null = null;
  if (calendarConfigured()) {
    try {
      const event = await insertEvent(args.staff.email, {
        summary: `${args.eventType.name} — ${args.guestName}`,
        description: buildEventDescription(args),
        startIso,
        endIso,
        timezone: resolveSchedulingZone(args.staff, args.brand),
        attendees: [{ email: args.guestEmail, displayName: args.guestName }],
        conferenceRequestId: bookingId,
        privateProperties: { bookingId },
      });
      meetUrl = event.meetUrl;
      googleEventId = event.id;
      icalUid = event.iCalUID;
    } catch (error) {
      await sql`
        update booking.booking
        set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system'
        where id = ${bookingId}`;
      await sendBookingAlert(
        `google-insert-failed:${args.staff.email}`,
        `Booking ${bookingId} for ${args.staff.fullName} failed at Google event creation and was rolled back: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return { ok: false, reason: "calendar_failed" };
    }
    await sql`
      update booking.booking
      set google_event_id = ${googleEventId}, google_ical_uid = ${icalUid}, meet_url = ${meetUrl}
      where id = ${bookingId}`;
  }

  const manageUrl = `${args.appUrl}/manage/${token.raw}`;
  try {
    await sendBookingEmail("confirmation", {
      bookingId,
      guestName: args.guestName,
      guestEmail: args.guestEmail,
      guestTimezone: args.guestTimezone ?? null,
      startIso,
      endIso,
      durationMin: args.eventType.durationMin,
      meetUrl,
      manageUrlRaw: manageUrl,
      brand: args.brand,
      staff: args.staff,
      eventType: args.eventType,
      tripName: args.tripName,
      tripUrl: args.tripUrl,
    });
  } catch (error) {
    await sendBookingAlert(
      `confirmation-email-failed:${bookingId}`,
      `Booking ${bookingId} confirmed but the confirmation email failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  try {
    const routedVia = args.routedVia ?? "primary";
    const conversationId = await createOrThreadConversation({
      mailboxId: args.brand.helpscoutMailboxId ?? "",
      assignToUserId: routedVia === "primary" ? args.staff.helpscoutUserId : null,
      guestName: args.guestName,
      guestEmail: args.guestEmail,
      subject: `${args.eventType.name} booked — ${args.guestName}`,
      bodyHtml:
        `<p>${args.guestName} booked a ${args.eventType.name} with ${args.staff.fullName}.</p>` +
        (routedVia !== "primary" && args.routedReason ? `<p><strong>Routing note:</strong> ${args.routedReason}</p>` : "") +
        (args.tripName ? `<p>Trip: ${args.tripName}</p>` : "") +
        (args.guestNotes ? `<p>Guest notes: ${args.guestNotes}</p>` : ""),
    });
    if (conversationId) {
      await sql`update booking.booking set helpscout_conversation_id = ${conversationId} where id = ${bookingId}`;
    }
  } catch (error) {
    await sendBookingAlert(
      `helpscout-failed:${bookingId}`,
      `Help Scout conversation for booking ${bookingId} failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values ('guest', 'booking_created', ${bookingId}, ${JSON.stringify({
      staff: args.staff.email,
      brand: args.brand.key,
      eventType: args.eventType.key,
      startIso,
      sourceKind: args.sourceKind,
      routedVia: args.routedVia ?? "primary",
    })}::jsonb)`;

  return { ok: true, bookingId, manageUrl, meetUrl, startIso, endIso };
}

function buildEventDescription(args: CreateBookingArgs): string {
  const lines = [
    `Guest: ${args.guestName} <${args.guestEmail}>`,
    args.guestPhone ? `Phone: ${args.guestPhone}` : null,
    args.tripName ? `Trip: ${args.tripName}` : null,
    args.guestNotes ? `Notes: ${args.guestNotes}` : null,
    `Booked via Leatherback Booking (${args.sourceKind}).`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function createHold(staffId: string, startIso: string, durationMin: number): Promise<string> {
  const sql = getSql();
  const endIso = new Date(new Date(startIso).getTime() + durationMin * 60_000).toISOString();
  await sql`delete from booking.slot_hold where expires_at <= now()`;
  const rows = await sql`
    insert into booking.slot_hold (staff_id, starts_at, ends_at, expires_at)
    values (${staffId}, ${startIso}, ${endIso}, now() + make_interval(secs => ${HOLD_SECONDS}))
    returning id`;
  return String(rows[0].id);
}

// ---------------------------------------------------------------------------
// Manage: lookup, cancel, reschedule
// ---------------------------------------------------------------------------

export type ManagedBooking = {
  id: string;
  staffId: string;
  brandId: string;
  eventTypeId: string;
  groupSessionId: string | null;
  startsAt: string;
  endsAt: string;
  guestName: string;
  guestEmail: string;
  guestTimezone: string | null;
  meetUrl: string | null;
  googleEventId: string | null;
  status: string;
  icalSequence: number;
  helpscoutConversationId: string | null;
};

/** Constant-time token check against the sha256 index lookup. Accepts both
 * the original random token (from the confirmation email) and the derived
 * `r.<id>.<hmac>` form used in reminder emails, where the original cannot be
 * reconstructed from its stored hash. */
export async function findBookingByToken(rawToken: string): Promise<ManagedBooking | null> {
  const sql = getSql();
  if (!rawToken || rawToken.length < 16 || rawToken.length > 160) return null;

  const secret = manageTokenSecret();
  if (rawToken.startsWith("r.") && secret) {
    const parsed = parseDerivedManageToken(rawToken, secret);
    if (!parsed) return null;
    const rows = await sql`select * from booking.booking where id = ${parsed.bookingId}`;
    return rows.length ? mapManagedBooking(rows[0]) : null;
  }

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(rawToken).digest();
  const rows = await sql`select * from booking.booking where manage_token_hash = ${hash}`;
  if (rows.length === 0) return null;
  const row = rows[0];
  // Belt and braces on top of the indexed lookup.
  if (!tokenMatches(rawToken, row.manage_token_hash as Uint8Array)) return null;
  return mapManagedBooking(row);
}

function mapManagedBooking(row: Record<string, unknown>): ManagedBooking {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    brandId: String(row.brand_id),
    eventTypeId: String(row.event_type_id),
    groupSessionId: (row.group_session_id as string | null) ?? null,
    startsAt: new Date(row.starts_at as string).toISOString(),
    endsAt: new Date(row.ends_at as string).toISOString(),
    guestName: String(row.guest_name),
    guestEmail: String(row.guest_email),
    guestTimezone: (row.guest_timezone as string | null) ?? null,
    meetUrl: (row.meet_url as string | null) ?? null,
    googleEventId: (row.google_event_id as string | null) ?? null,
    status: String(row.status),
    icalSequence: Number(row.ical_sequence ?? 0),
    helpscoutConversationId: (row.helpscout_conversation_id as string | null) ?? null,
  };
}

/** A token is inert once the booking is cancelled or the call is in the past. */
export function bookingManageable(booking: ManagedBooking, now = new Date()): boolean {
  return booking.status === "confirmed" && new Date(booking.startsAt).getTime() > now.getTime();
}

export type BookingContext = {
  staff: Staff;
  brand: Brand;
  eventType: EventType;
};

export async function cancelBooking(
  booking: ManagedBooking,
  ctx: BookingContext,
  cancelledBy: "guest" | "bm" | "system",
): Promise<{ ok: boolean }> {
  const sql = getSql();
  const rows = await sql`
    update booking.booking
    set status = 'cancelled', cancelled_at = now(), cancelled_by = ${cancelledBy},
        ical_sequence = ical_sequence + 1
    where id = ${booking.id} and status = 'confirmed'
    returning ical_sequence`;
  if (rows.length === 0) return { ok: false };
  const sequence = Number(rows[0].ical_sequence);

  if (booking.googleEventId && calendarConfigured()) {
    try {
      await deleteEvent(ctx.staff.email, booking.googleEventId);
    } catch (error) {
      await sendBookingAlert(
        `google-delete-failed:${booking.id}`,
        `Booking ${booking.id} cancelled but the Google event could not be removed from ${ctx.staff.email}'s calendar: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  try {
    await sendBookingEmail("cancellation", {
      bookingId: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestTimezone: booking.guestTimezone,
      startIso: booking.startsAt,
      endIso: booking.endsAt,
      durationMin: ctx.eventType.durationMin,
      meetUrl: booking.meetUrl,
      manageUrlRaw: "",
      brand: ctx.brand,
      staff: ctx.staff,
      eventType: ctx.eventType,
      icalSequence: sequence,
    });
  } catch (error) {
    await sendBookingAlert(
      `cancellation-email-failed:${booking.id}`,
      `Cancellation email for booking ${booking.id} failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  try {
    if (booking.helpscoutConversationId) {
      await createOrThreadConversation({
        mailboxId: ctx.brand.helpscoutMailboxId ?? "",
        assignToUserId: null,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        subject: "",
        bodyHtml: `<p>${booking.guestName} cancelled their ${ctx.eventType.name} (was ${booking.startsAt}). Cancelled by: ${cancelledBy}.</p>`,
        existingConversationId: booking.helpscoutConversationId,
      });
    }
  } catch {
    // Threading a note is best-effort; the cancellation itself already stands.
  }

  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${cancelledBy}, 'booking_cancelled', ${booking.id}, ${JSON.stringify({ startIso: booking.startsAt })}::jsonb)`;
  return { ok: true };
}

export type RescheduleResult =
  | { ok: true; startIso: string; endIso: string }
  | { ok: false; reason: "slot_taken" | "slot_invalid" | "not_manageable" };

/**
 * Reschedule keeps the SAME BM — the fallback chain never re-runs here. A
 * guest changing the time of their call with Claire must not end up with
 * anyone else (§7.4). events.patch keeps the same Meet link.
 */
export async function rescheduleBooking(
  booking: ManagedBooking,
  ctx: BookingContext,
  newStartIso: string,
  appUrl: string,
  rawToken: string,
): Promise<RescheduleResult> {
  const sql = getSql();
  if (!bookingManageable(booking)) return { ok: false, reason: "not_manageable" };
  const now = new Date();
  const start = new Date(newStartIso);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "slot_invalid" };
  const startIso = start.toISOString();
  const endIso = new Date(start.getTime() + ctx.eventType.durationMin * 60_000).toISOString();

  // Fresh availability for the same BM only.
  let busy: Interval[] = [];
  if (calendarConfigured()) {
    try {
      const result = await freeBusy(
        ctx.staff.email,
        [ctx.staff.email],
        now.toISOString(),
        new Date(now.getTime() + ctx.staff.bookingWindowDays * 86_400_000).toISOString(),
      );
      busy = result.busyByEmail.get(ctx.staff.email.toLowerCase()) ?? [];
      // The existing Google event shows as busy — carve out the current
      // booking's own time so "move it an hour later" isn't self-blocked.
      busy = busy.filter((b) => !(b.start === booking.startsAt || (new Date(b.start).getTime() < new Date(booking.endsAt).getTime() && new Date(b.end).getTime() > new Date(booking.startsAt).getTime())));
    } catch {
      return { ok: false, reason: "slot_invalid" };
    }
  }
  const workingHours = await getWorkingHours(ctx.staff.id);
  const validSlots = computeSlots({
    schedulingZone: resolveSchedulingZone(ctx.staff, ctx.brand),
    workingHours,
    durationMin: ctx.eventType.durationMin,
    bufferMinutes: ctx.staff.bufferMinutes,
    minNoticeHours: ctx.staff.minNoticeHours,
    windowStart: now.toISOString(),
    windowEnd: new Date(now.getTime() + ctx.staff.bookingWindowDays * 86_400_000).toISOString(),
    now: now.toISOString(),
    busy,
  });
  if (!validSlots.some((slot) => slot.start === startIso)) {
    return { ok: false, reason: "slot_taken" };
  }

  let sequence: number;
  try {
    const rows = await sql`
      update booking.booking
      set starts_at = ${startIso}, ends_at = ${endIso}, rescheduled_at = now(),
          reminder_24h_sent_at = null, reminder_1h_sent_at = null,
          ical_sequence = ical_sequence + 1
      where id = ${booking.id} and status = 'confirmed'
      returning ical_sequence`;
    if (rows.length === 0) return { ok: false, reason: "not_manageable" };
    sequence = Number(rows[0].ical_sequence);
  } catch (error) {
    if (pgCode(error) === "23P01") return { ok: false, reason: "slot_taken" };
    throw error;
  }

  if (booking.googleEventId && calendarConfigured()) {
    try {
      await patchEvent(ctx.staff.email, booking.googleEventId, {
        startIso,
        endIso,
        timezone: resolveSchedulingZone(ctx.staff, ctx.brand),
      });
    } catch (error) {
      await sendBookingAlert(
        `google-patch-failed:${booking.id}`,
        `Booking ${booking.id} rescheduled in the database but events.patch failed for ${ctx.staff.email}: ${error instanceof Error ? error.message : "unknown"} — calendars disagree until retried.`,
      );
    }
  }

  try {
    await sendBookingEmail("reschedule", {
      bookingId: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestTimezone: booking.guestTimezone,
      startIso,
      endIso,
      durationMin: ctx.eventType.durationMin,
      meetUrl: booking.meetUrl,
      manageUrlRaw: `${appUrl}/manage/${rawToken}`,
      brand: ctx.brand,
      staff: ctx.staff,
      eventType: ctx.eventType,
      icalSequence: sequence,
    });
  } catch (error) {
    await sendBookingAlert(
      `reschedule-email-failed:${booking.id}`,
      `Reschedule email for booking ${booking.id} failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values ('guest', 'booking_rescheduled', ${booking.id}, ${JSON.stringify({ from: booking.startsAt, to: startIso })}::jsonb)`;
  return { ok: true, startIso, endIso };
}
