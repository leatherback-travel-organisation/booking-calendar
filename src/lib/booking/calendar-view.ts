import "server-only";

// Builds the Google-Calendar-style week view for one BM: everything is
// flattened server-side to minutes-from-midnight spans in the scheduling zone
// so the rendering component stays pure (no Date/DateTime in render bodies).
// Used by the Dashboard (with a BM dropdown) and each BM's own page.
//
// Busy time is read STRAIGHT FROM GOOGLE (free/busy for the BM's own
// calendar), not inferred from the gaps between open slots. Inferring it
// meant a commitment outside working hours was invisible and a buffer looked
// identical to a real meeting — neither is that BM's live calendar.

import { DateTime } from "luxon";
import type {
  CalendarBlock,
  CalendarDay,
  CalendarView,
} from "@/components/booking/dashboard/availability-calendar";
import { mergeIntervals, resolveSchedulingZone, workingWeekStart } from "./availability/engine";
import {
  availabilityForStaff,
  cachedFreeBusy,
  getBrandById,
  getEventType,
  getEventTypesForBrand,
} from "./availability/service";
import { getSql } from "./db";
import { calendarConfigured } from "./google/auth";
import type { Interval, Staff } from "./model";

// The working week: Monday–Friday, 08:00–18:00 in the BM's scheduling zone.
// Weekends are not shown — nobody books calls on them and two dead columns
// cost a third of the width.
const CAL_DAYS = 5;
const CAL_START_MIN = 8 * 60;
const CAL_END_MIN = 18 * 60;

type MinuteSpan = { start: number; end: number };

/** Clip a minute-of-day span to the visible 08:00–18:00 window. */
function clipToVisible(span: MinuteSpan): MinuteSpan | null {
  const start = Math.max(span.start, CAL_START_MIN);
  const end = Math.min(span.end, CAL_END_MIN);
  return end > start ? { start, end } : null;
}

function mergeSpans(spans: MinuteSpan[]): MinuteSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: MinuteSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** base minus remove, all spans in minutes-of-day. */
function subtractSpans(base: MinuteSpan[], remove: MinuteSpan[]): MinuteSpan[] {
  const removals = mergeSpans(remove);
  const out: MinuteSpan[] = [];
  for (const span of base) {
    let cursor = span.start;
    for (const removal of removals) {
      if (removal.end <= cursor || removal.start >= span.end) continue;
      if (removal.start > cursor) out.push({ start: cursor, end: removal.start });
      cursor = Math.max(cursor, removal.end);
      if (cursor >= span.end) break;
    }
    if (cursor < span.end) out.push({ start: cursor, end: span.end });
  }
  return out;
}

/**
 * Project a UTC interval onto one local calendar day, as wall-clock minutes
 * from midnight in the scheduling zone, clipped to the visible hours.
 */
function spanForDay(startIso: string, endIso: string, day: DateTime, zone: string): MinuteSpan | null {
  const dayEnd = day.plus({ days: 1 });
  const start = DateTime.fromISO(startIso, { zone });
  const end = DateTime.fromISO(endIso, { zone });
  if (!start.isValid || !end.isValid || end <= day || start >= dayEnd) return null;
  const startMin = start < day ? 0 : start.hour * 60 + start.minute;
  const endMin = end >= dayEnd ? 24 * 60 : end.hour * 60 + end.minute;
  return clipToVisible({ start: startMin, end: endMin });
}

function minuteLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function spanTooltip(span: MinuteSpan, suffix: string): string {
  return `${minuteLabel(span.start)}–${minuteLabel(span.end)} · ${suffix}`;
}

export async function buildCalendarView(staff: Staff): Promise<CalendarView> {
  const brand = staff.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
  if (!brand) {
    return { kind: "message", message: `${staff.fullName} has no primary brand set, so availability cannot be computed.` };
  }
  let eventType = await getEventType(brand.id, "enquiry");
  if (!eventType) {
    const all = await getEventTypesForBrand(brand.id);
    eventType = all.find((candidate) => candidate.active && candidate.guestFacing) ?? null;
  }
  if (!eventType) {
    return { kind: "message", message: `${brand.name} has no guest-facing event type, so availability cannot be computed.` };
  }

  const zone = resolveSchedulingZone(staff, brand);
  const today = DateTime.now().setZone(zone).startOf("day");
  const firstDay = workingWeekStart(today);
  const windowStartIso = firstDay.toUTC().toISO()!;
  const windowEndIso = firstDay.plus({ days: CAL_DAYS }).toUTC().toISO()!;
  const todayKey = today.toFormat("yyyy-LL-dd");

  const sql = getSql();
  const [availability, bookingRows] = await Promise.all([
    availabilityForStaff({ staff, brand, eventType }),
    sql`
      select b.id, b.starts_at, b.ends_at, b.guest_name, et.name as event_type_name
      from booking.booking b
      join booking.event_type et on et.id = b.event_type_id
      where b.staff_id = ${staff.id} and b.status = 'confirmed'
        and b.starts_at < ${windowEndIso} and b.ends_at > ${windowStartIso}
      order by b.starts_at`,
  ]);

  // Adjacent/overlapping 30-min slots coalesce into contiguous "Open" ranges.
  const openRanges = mergeIntervals(availability.slots);

  // The BM's real calendar for exactly the week on screen. availability's own
  // free/busy covers a different window, so this is a separate (cached) read.
  let googleBusy: Interval[] = [];
  let calendarReachable = availability.calendarReachable;
  if (calendarConfigured()) {
    try {
      const { busyByEmail, unreachable } = await cachedFreeBusy(
        staff.email,
        [staff.email],
        windowStartIso,
        windowEndIso,
      );
      googleBusy = busyByEmail.get(staff.email.toLowerCase()) ?? [];
      if (unreachable.length > 0) calendarReachable = false;
    } catch {
      // An outage is not an empty calendar — say so rather than showing a
      // week that looks wide open.
      calendarReachable = false;
    }
  }

  const days: CalendarDay[] = [];
  for (let i = 0; i < CAL_DAYS; i += 1) {
    const day = firstDay.plus({ days: i });
    const dayKey = day.toFormat("yyyy-LL-dd");
    const blocks: CalendarBlock[] = [];
    const bookedSpans: MinuteSpan[] = [];

    for (const row of bookingRows) {
      const startIso = new Date(row.starts_at as string).toISOString();
      const endIso = new Date(row.ends_at as string).toISOString();
      const span = spanForDay(startIso, endIso, day, zone);
      if (!span) continue;
      bookedSpans.push(span);
      const guestName = String(row.guest_name);
      const eventTypeName = String(row.event_type_name);
      blocks.push({
        key: `booked-${String(row.id)}-${dayKey}`,
        kind: "booked",
        startMin: span.start,
        endMin: span.end,
        timeLabel: DateTime.fromISO(startIso, { zone }).toFormat("h:mm a"),
        title: guestName,
        subtitle: eventTypeName,
        tooltip: spanTooltip(span, `${guestName} · ${eventTypeName}`),
      });
    }

    for (const range of openRanges) {
      const span = spanForDay(range.start, range.end, day, zone);
      if (!span) continue;
      blocks.push({
        key: `open-${dayKey}-${span.start}`,
        kind: "open",
        startMin: span.start,
        endMin: span.end,
        timeLabel: null,
        title: null,
        subtitle: null,
        tooltip: spanTooltip(span, "Open"),
      });
    }

    // Real Google-calendar busy time. CallTime's own bookings are on that
    // calendar too, so subtract them — a booked call renders once, as the
    // block that knows the guest's name.
    const googleSpans = mergeSpans(
      googleBusy
        .map((interval) => spanForDay(interval.start, interval.end, day, zone))
        .filter((span): span is MinuteSpan => span !== null),
    );
    for (const span of subtractSpans(googleSpans, bookedSpans)) {
      blocks.push({
        key: `busy-${dayKey}-${span.start}`,
        kind: "busy",
        startMin: span.start,
        endMin: span.end,
        timeLabel: null,
        title: null,
        subtitle: null,
        tooltip: spanTooltip(span, "Busy (Google Calendar)"),
      });
    }

    days.push({
      key: dayKey,
      weekday: day.toFormat("ccc"),
      dateLabel: day.toFormat("d LLL"),
      isToday: dayKey === todayKey,
      blocks,
    });
  }

  const notice = !calendarConfigured() ? "not-connected" : calendarReachable ? null : "unreachable";
  return { kind: "grid", zone, days, notice };
}
