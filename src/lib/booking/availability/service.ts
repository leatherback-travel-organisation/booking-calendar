// Server-side availability: loads scheduling state from Postgres, fetches
// free/busy through delegation (60-second server cache), and runs the pure
// engine. Every public availability endpoint goes through here.

import "server-only";

import { getSql } from "../db";
import { calendarConfigured } from "../google/auth";
import { freeBusy, GoogleCalendarError } from "../google/calendar";
import { GoogleDelegationError } from "../google/auth";
import { isSeniorTitle, type Brand, type EventType, type Interval, type Slot, type Staff, type WorkingHours } from "../model";
import { computeSlots, rankByOpenSlots, resolveSchedulingZone } from "./engine";

const FREEBUSY_CACHE_SECONDS = 60;

type StaffRow = Record<string, unknown>;

function mapStaff(row: StaffRow, brandIds: string[]): Staff {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    firstName: String(row.first_name),
    slug: String(row.slug),
    primaryBrandId: (row.primary_brand_id as string | null) ?? null,
    brandIds,
    timezoneOverride: (row.timezone_override as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    photoUrl: (row.photo_url as string | null) ?? null,
    helpscoutUserId: (row.helpscout_user_id as string | null) ?? null,
    aircallUserId: (row.aircall_user_id as string | null) ?? null,
    slackUserId: (row.slack_user_id as string | null) ?? null,
    airtableRecordId: (row.airtable_record_id as string | null) ?? null,
    bufferMinutes: Number(row.buffer_minutes),
    minNoticeHours: Number(row.min_notice_hours),
    bookingWindowDays: Number(row.booking_window_days),
    // Default true so an un-migrated database behaves like the schema default.
    reminder24hEnabled: row.reminder_24h_enabled === undefined ? true : Boolean(row.reminder_24h_enabled),
    reminder1hEnabled: row.reminder_1h_enabled === undefined ? true : Boolean(row.reminder_1h_enabled),
    videoCallsEnabled: Boolean(row.video_calls_enabled),
    jobTitle: (row.job_title as string | null) ?? null,
    isSenior: isSeniorTitle((row.job_title as string | null) ?? null),
    active: Boolean(row.active),
    calendarOk: Boolean(row.calendar_ok),
  };
}

export function mapBrand(row: Record<string, unknown>): Brand {
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name),
    aliases: (row.aliases as string[]) ?? [],
    logoUrl: (row.logo_url as string | null) ?? null,
    colorPrimary: (row.color_primary as string | null) ?? null,
    colorAccent: (row.color_accent as string | null) ?? null,
    schedulingTimezone: String(row.scheduling_timezone),
    market: row.market as "AU" | "US",
    phoneAu: (row.phone_au as string | null) ?? null,
    phoneNz: (row.phone_nz as string | null) ?? null,
    phoneDefault: (row.phone_default as string | null) ?? null,
    helpscoutMailboxId: (row.helpscout_mailbox_id as string | null) ?? null,
    fromEmail: String(row.from_email),
    fromName: String(row.from_name),
    replyTo: (row.reply_to as string | null) ?? null,
    smsRemindersEnabled: Boolean(row.sms_reminders_enabled),
    active: Boolean(row.active),
  };
}

export function mapEventType(row: Record<string, unknown>): EventType {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    key: String(row.key),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    durationMin: Number(row.duration_min),
    guestFacing: Boolean(row.guest_facing),
    supportsGroup: Boolean(row.supports_group),
    locationKind: row.location_kind as "google_meet" | "phone",
    active: Boolean(row.active),
    position: Number(row.position),
  };
}

export async function getStaffBySlug(slug: string): Promise<Staff | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.staff where slug = ${slug} and active`;
  if (rows.length === 0) return null;
  return withBrandIds(rows[0]);
}

export async function getStaffByEmail(email: string): Promise<Staff | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.staff where email = ${email.trim().toLowerCase()} and active`;
  if (rows.length === 0) return null;
  return withBrandIds(rows[0]);
}

export async function getStaffById(id: string): Promise<Staff | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.staff where id = ${id}`;
  if (rows.length === 0) return null;
  return withBrandIds(rows[0]);
}

async function withBrandIds(row: StaffRow): Promise<Staff> {
  const sql = getSql();
  const memberships = await sql`select brand_id from booking.staff_brand where staff_id = ${String(row.id)}`;
  return mapStaff(row, memberships.map((m) => String(m.brand_id)));
}

export async function getBrandByKey(key: string): Promise<Brand | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.brand where key = ${key} and active`;
  return rows.length ? mapBrand(rows[0]) : null;
}

export async function getBrandById(id: string): Promise<Brand | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.brand where id = ${id}`;
  return rows.length ? mapBrand(rows[0]) : null;
}

export async function getEventTypesForBrand(brandId: string): Promise<EventType[]> {
  const sql = getSql();
  const rows = await sql`select * from booking.event_type where brand_id = ${brandId} order by position`;
  return rows.map(mapEventType);
}

export async function getEventTypeById(id: string): Promise<EventType | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.event_type where id = ${id}`;
  return rows.length ? mapEventType(rows[0]) : null;
}

export async function getEventType(brandId: string, key: string): Promise<EventType | null> {
  const sql = getSql();
  const rows = await sql`select * from booking.event_type where brand_id = ${brandId} and key = ${key} and active`;
  return rows.length ? mapEventType(rows[0]) : null;
}

export async function getWorkingHours(staffId: string): Promise<WorkingHours[]> {
  const sql = getSql();
  const rows = await sql`select day_of_week, start_min, end_min from booking.working_hours where staff_id = ${staffId}`;
  return rows.map((r) => ({ dayOfWeek: Number(r.day_of_week), startMin: Number(r.start_min), endMin: Number(r.end_min) }));
}

async function getHolds(staffId: string): Promise<Interval[]> {
  const sql = getSql();
  const rows = await sql`
    select starts_at, ends_at from booking.slot_hold
    where staff_id = ${staffId} and expires_at > now()`;
  return rows.map((r) => ({ start: new Date(r.starts_at as string).toISOString(), end: new Date(r.ends_at as string).toISOString() }));
}

export async function getConfirmed(staffId: string, fromIso: string, toIso: string): Promise<Interval[]> {
  const sql = getSql();
  const rows = await sql`
    select starts_at, ends_at from booking.booking
    where staff_id = ${staffId} and status = 'confirmed'
      and starts_at < ${toIso} and ends_at > ${fromIso}`;
  return rows.map((r) => ({ start: new Date(r.starts_at as string).toISOString(), end: new Date(r.ends_at as string).toISOString() }));
}

/**
 * Free/busy with a 60-second server-side cache (booking.reference_cache).
 * Never cached in the browser. When Google is unconfigured or unreachable the
 * caller decides how loudly to fail — availability treats it as an outage,
 * not as an empty calendar.
 */
export async function cachedFreeBusy(
  subjectEmail: string,
  emails: string[],
  timeMinIso: string,
  timeMaxIso: string,
): Promise<{ busyByEmail: Map<string, Interval[]>; unreachable: string[] }> {
  const sql = getSql();
  const wanted = emails.map((e) => e.toLowerCase());
  const busyByEmail = new Map<string, Interval[]>();
  const misses: string[] = [];

  for (const email of wanted) {
    const key = `freebusy:${email}:${timeMinIso}:${timeMaxIso}`;
    const rows = await sql`
      select payload from booking.reference_cache
      where key = ${key} and fetched_at > now() - make_interval(secs => ${FREEBUSY_CACHE_SECONDS})`;
    if (rows.length) {
      const payload = rows[0].payload as { busy: Interval[] };
      busyByEmail.set(email, payload.busy);
    } else {
      misses.push(email);
    }
  }

  let unreachable: string[] = [];
  if (misses.length > 0) {
    const fetched = await freeBusy(subjectEmail, misses, timeMinIso, timeMaxIso);
    unreachable = fetched.unreachable;
    for (const [email, busy] of fetched.busyByEmail) {
      busyByEmail.set(email, busy);
      const key = `freebusy:${email}:${timeMinIso}:${timeMaxIso}`;
      await sql`
        insert into booking.reference_cache (key, payload, fetched_at)
        values (${key}, ${JSON.stringify({ busy })}::jsonb, now())
        on conflict (key) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`;
    }
  }
  return { busyByEmail, unreachable };
}

export type StaffAvailability = {
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  schedulingZone: string;
  slots: Slot[];
  /** False when Google free/busy could not be fetched — surface loudly. */
  calendarReachable: boolean;
  windowStart: string;
  windowEnd: string;
};

/**
 * Availability for one BM for one event type, in the brand's scheduling zone.
 * The whole booking window is computed in one pass; the picker paginates
 * client-side (§6.3 — fetch once, page locally).
 */
export async function availabilityForStaff(args: {
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  now?: Date;
}): Promise<StaffAvailability> {
  const { staff, brand, eventType } = args;
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const windowStart = nowIso;
  const windowEnd = new Date(now.getTime() + staff.bookingWindowDays * 86_400_000).toISOString();

  const [workingHours, holds, confirmed] = await Promise.all([
    getWorkingHours(staff.id),
    getHolds(staff.id),
    getConfirmed(staff.id, windowStart, windowEnd),
  ]);

  let busy: Interval[] = [];
  let calendarReachable = false;
  if (calendarConfigured()) {
    try {
      const result = await cachedFreeBusy(staff.email, [staff.email], windowStart, windowEnd);
      const fetched = result.busyByEmail.get(staff.email.toLowerCase());
      if (fetched) {
        busy = fetched;
        calendarReachable = true;
      }
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) && !(error instanceof GoogleDelegationError)) throw error;
      calendarReachable = false;
    }
  }

  const schedulingZone = resolveSchedulingZone(staff, brand);
  // An unreachable calendar yields NO slots rather than a wide-open week —
  // offering times we cannot verify is how double-bookings happen.
  const slots = calendarReachable || !calendarConfigured()
    ? computeSlots({
        schedulingZone,
        workingHours,
        durationMin: eventType.durationMin,
        bufferMinutes: staff.bufferMinutes,
        minNoticeHours: staff.minNoticeHours,
        windowStart,
        windowEnd,
        now: nowIso,
        busy,
        holds,
        confirmed,
      })
    : [];

  return {
    staff,
    brand,
    eventType,
    schedulingZone,
    slots,
    calendarReachable: calendarConfigured() ? calendarReachable : false,
    windowStart,
    windowEnd,
  };
}

export type RankedBackup = {
  staff: Staff;
  openSlotCount: number;
  firstSlot: string | null;
};

/**
 * Same-brand backups ranked by real calendar availability over the next
 * 7 days — one freebusy.query for all candidates, computed lazily only when
 * the guest asks for alternatives. Ordering, never assignment.
 */
export async function rankBackups(args: {
  brand: Brand;
  eventType: EventType;
  excludeStaffId: string;
  now?: Date;
}): Promise<RankedBackup[]> {
  const sql = getSql();
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const horizonIso = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  const rows = await sql`
    select s.* from booking.staff s
    join booking.staff_brand sb on sb.staff_id = s.id
    where sb.brand_id = ${args.brand.id} and s.active and s.id <> ${args.excludeStaffId}`;
  if (rows.length === 0) return [];

  const candidates = await Promise.all(rows.map((row) => withBrandIds(row)));
  const emails = candidates.map((c) => c.email);

  let busyByEmail = new Map<string, Interval[]>();
  if (calendarConfigured()) {
    try {
      const result = await cachedFreeBusy(emails[0], emails, nowIso, horizonIso);
      busyByEmail = result.busyByEmail;
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) && !(error instanceof GoogleDelegationError)) throw error;
      return []; // no verified availability — offer the phone, not guesses
    }
  }

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const [workingHours, holds, confirmed] = await Promise.all([
        getWorkingHours(candidate.id),
        getHolds(candidate.id),
        getConfirmed(candidate.id, nowIso, horizonIso),
      ]);
      const busy = busyByEmail.get(candidate.email.toLowerCase());
      if (calendarConfigured() && !busy) return { name: candidate.fullName, staff: candidate, slots: [] };
      const slots = computeSlots({
        schedulingZone: resolveSchedulingZone(candidate, args.brand),
        workingHours,
        durationMin: args.eventType.durationMin,
        bufferMinutes: candidate.bufferMinutes,
        minNoticeHours: candidate.minNoticeHours,
        windowStart: nowIso,
        windowEnd: horizonIso,
        now: nowIso,
        busy: busy ?? [],
        holds,
        confirmed,
      });
      return { name: candidate.fullName, staff: candidate, slots };
    }),
  );

  return rankByOpenSlots(scored)
    .filter((entry) => entry.slots.length > 0)
    .map((entry) => ({
      staff: entry.staff,
      openSlotCount: entry.slots.length,
      firstSlot: entry.slots[0]?.start ?? null,
    }));
}
