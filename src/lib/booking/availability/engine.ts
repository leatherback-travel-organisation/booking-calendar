// The availability engine. Pure functions, no I/O — every timezone decision
// in the app funnels through here so it can be tested exhaustively.
//
// Two rules with teeth:
// 1. Working hours are anchored to the SCHEDULING zone — the brand's market
//    (staff.timezone_override wins when set) — never the BM's home timezone.
// 2. No raw-Date arithmetic. Luxon resolves every wall-clock time in-zone, so
//    DST transitions (Melbourne October, Los Angeles March…) come out right.

import { DateTime } from "luxon";
import type { Interval, Slot, WorkingHours } from "../model";

export const DEFAULT_GRANULARITY_MIN = 30;

export type ComputeSlotsArgs = {
  /** IANA zone the working hours are expressed in. */
  schedulingZone: string;
  workingHours: WorkingHours[];
  durationMin: number;
  bufferMinutes: number;
  minNoticeHours: number;
  granularityMin?: number;
  /** UTC ISO bounds of the bookable window. */
  windowStart: string;
  windowEnd: string;
  /** Injected clock so tests are deterministic. */
  now: string;
  /** Busy intervals from Google free/busy (leave included — busy is busy). */
  busy: Interval[];
  /** Unexpired slot holds. Not buffer-expanded — they are transient. */
  holds?: Interval[];
  /** Confirmed bookings (belt and braces — the DB constraint is truth). */
  confirmed?: Interval[];
};

type Instant = { startMs: number; endMs: number };

function toInstant(interval: Interval): Instant | null {
  const start = DateTime.fromISO(interval.start);
  const end = DateTime.fromISO(interval.end);
  if (!start.isValid || !end.isValid || end <= start) return null;
  return { startMs: start.toMillis(), endMs: end.toMillis() };
}

function overlaps(aStartMs: number, aEndMs: number, b: Instant): boolean {
  // Half-open intervals: touching endpoints do not overlap.
  return aStartMs < b.endMs && aEndMs > b.startMs;
}

export function resolveSchedulingZone(
  staff: { timezoneOverride: string | null },
  brand: { schedulingTimezone: string },
): string {
  return staff.timezoneOverride ?? brand.schedulingTimezone;
}

export function computeSlots(args: ComputeSlotsArgs): Slot[] {
  const granularity = args.granularityMin ?? DEFAULT_GRANULARITY_MIN;
  const zone = args.schedulingZone;

  const windowStart = DateTime.fromISO(args.windowStart);
  const windowEnd = DateTime.fromISO(args.windowEnd);
  const now = DateTime.fromISO(args.now);
  if (!windowStart.isValid || !windowEnd.isValid || !now.isValid) return [];
  if (windowEnd <= windowStart) return [];
  const probe = DateTime.now().setZone(zone);
  if (!probe.isValid) return []; // unknown IANA zone — caller surfaces this

  const earliestStartMs = Math.max(
    windowStart.toMillis(),
    now.plus({ hours: args.minNoticeHours }).toMillis(),
  );
  const windowEndMs = windowEnd.toMillis();

  const bufferMs = args.bufferMinutes * 60_000;
  const buffered: Instant[] = [];
  for (const interval of [...args.busy, ...(args.confirmed ?? [])]) {
    const instant = toInstant(interval);
    if (instant) buffered.push({ startMs: instant.startMs - bufferMs, endMs: instant.endMs + bufferMs });
  }
  const unbuffered: Instant[] = [];
  for (const interval of args.holds ?? []) {
    const instant = toInstant(interval);
    if (instant) unbuffered.push(instant);
  }

  const hoursByDow = new Map<number, WorkingHours[]>();
  for (const row of args.workingHours) {
    const list = hoursByDow.get(row.dayOfWeek) ?? [];
    list.push(row);
    hoursByDow.set(row.dayOfWeek, list);
  }

  const seen = new Set<number>();
  const slots: Slot[] = [];

  // Iterate local calendar days in the scheduling zone. plus({days:1}) on a
  // zoned start-of-day lands on the next local midnight even across DST.
  let day = windowStart.setZone(zone).startOf("day");
  const lastDay = windowEnd.setZone(zone).startOf("day");
  for (; day <= lastDay; day = day.plus({ days: 1 })) {
    const dow = day.weekday % 7; // luxon: 1=Mon..7=Sun → ours: 0=Sun..6=Sat
    const rows = hoursByDow.get(dow);
    if (!rows) continue;

    for (const row of rows) {
      const closeWall = wallTime(day, row.endMin);
      if (!closeWall) continue;
      const closeMs = closeWall.toMillis();

      for (let minute = row.startMin; minute + args.durationMin <= row.endMin; minute += granularity) {
        const start = wallTime(day, minute);
        // A null here is the spring-forward gap: that wall-clock time simply
        // does not exist today. Skip it rather than shifting it an hour.
        if (!start) continue;
        const startMs = start.toMillis();
        if (startMs < earliestStartMs) continue;
        // Duration is real elapsed time; compare instants against close so a
        // call never runs past the end of the working block.
        const end = start.plus({ minutes: args.durationMin });
        const endMs = end.toMillis();
        if (endMs > closeMs) continue;
        if (endMs > windowEndMs) continue;
        if (buffered.some((b) => overlaps(startMs, endMs, b))) continue;
        if (unbuffered.some((b) => overlaps(startMs, endMs, b))) continue;
        if (seen.has(startMs)) continue;
        seen.add(startMs);
        slots.push({
          start: start.toUTC().toISO()!,
          end: end.toUTC().toISO()!,
        });
      }
    }
  }

  slots.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return slots;
}

/**
 * Resolve minutes-from-midnight to the actual zoned time on the given local
 * day. Returns null when that wall-clock time does not exist (spring-forward
 * gap). On fall-back days a repeated wall time resolves to its first
 * occurrence, so the repeated hour yields one slot, not two.
 */
function wallTime(day: DateTime, minutesFromMidnight: number): DateTime | null {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  if (hour >= 24) {
    if (hour === 24 && minute === 0) {
      return day.plus({ days: 1 }).startOf("day");
    }
    return null;
  }
  const resolved = day.set({ hour, minute, second: 0, millisecond: 0 });
  if (!resolved.isValid) return null;
  if (resolved.hour !== hour || resolved.minute !== minute) return null;
  return resolved;
}

/** Merge overlapping/touching intervals; used for pool availability views. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const instants = intervals
    .map(toInstant)
    .filter((value): value is Instant => value !== null)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: Instant[] = [];
  for (const current of instants) {
    const last = merged[merged.length - 1];
    if (last && current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }
  return merged.map((i) => ({
    start: DateTime.fromMillis(i.startMs).toUTC().toISO()!,
    end: DateTime.fromMillis(i.endMs).toUTC().toISO()!,
  }));
}

/**
 * Order backup candidates by genuine calendar availability: most open slots
 * in the ranking window first, tie-broken by soonest first slot then name so
 * the ordering is stable. This is ordering, never assignment — the guest
 * always chooses.
 */
export function rankByOpenSlots<T extends { name: string; slots: Slot[] }>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    if (b.slots.length !== a.slots.length) return b.slots.length - a.slots.length;
    const aFirst = a.slots[0]?.start ?? "9999";
    const bFirst = b.slots[0]?.start ?? "9999";
    if (aFirst !== bFirst) return aFirst < bFirst ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
