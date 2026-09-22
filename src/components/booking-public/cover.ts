// Cover: what the booking page says and shows when the Booking Manager a
// guest asked for is away. Pure functions, kept out of the component so the
// rules can be tested — the copy fires on a judgement about someone's
// calendar, and getting it wrong is silent.

import type { BackupEntry, PublicSlot } from "./types";

/** A primary this far out, with a backup free sooner, triggers the cover
 *  prompt (Nicola, 4 Sep): long enough that a merely busy week stays quiet,
 *  short enough that real leave always surfaces. */
export const COVER_GAP_DAYS = 3;

/** Nothing open for this long and the backup stops being a footnote (Nicola,
 *  8 Sep): a guest facing a blank week needs a bookable time in front of
 *  them, not at the bottom of the panel. */
export const QUIET_WEEK_DAYS = 7;

const DAY_MS = 86_400_000;

/** What the availability API knows about the BM's week, so a gap can be
 *  measured in THEIR working days rather than clock time. */
export type CoverCalendar = {
  /** IANA zone the working hours are anchored to. */
  schedulingZone: string;
  /** Days of week (0 = Sunday … 6 = Saturday) that carry working hours. */
  workingDays: readonly number[];
};

/** Days since the epoch of the local calendar date holding `ms` in `zone`. */
function localDayIndex(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / DAY_MS;
}

/** Working days strictly between the local dates of two instants that have
 *  nothing open — the days a guest would actually experience as "away". */
export function emptyWorkingDaysBetween(fromMs: number, toMs: number, calendar: CoverCalendar): number {
  const first = localDayIndex(fromMs, calendar.schedulingZone);
  const last = localDayIndex(toMs, calendar.schedulingZone);
  let count = 0;
  for (let day = first + 1; day < last; day++) {
    if (calendar.workingDays.includes(new Date(day * DAY_MS).getUTCDay())) count++;
  }
  return count;
}

/** Where the backup's times belong: always first (Nicola, 15 Sep). The 8 Sep
 *  rule put them at the bottom whenever the primary had something within a
 *  week, so a guest scrolled past a full week of the primary's times before
 *  seeing the sooner option; now the backup leads and "Or wait for <name>:"
 *  introduces the primary's times beneath. Kept as a function so the render
 *  site reads the same and the rule can change again in one place. */
export function backupPlacement(_primaryFirstMs: number | null, _nowMs: number): "with-times" | "bottom" {
  return "with-times";
}

/**
 * The stretch of COVER_GAP_DAYS or more WORKING days with nothing open,
 * starting within the next week. Returns when it starts and when they are back.
 *
 * Two shapes count, and the second was missed until 8 Sep. Leave usually
 * begins in a day or two, leaving a hole BETWEEN two open times — that was
 * all this looked for. But once the leave actually starts there is nothing
 * before the hole any more, and the warm copy fell silent at exactly the
 * moment it was most true. So a hole running from NOW to the first opening
 * counts as well.
 *
 * Measured in the BM's working days since 22 Sep: the clock-time version
 * called Janie "off on an adventure" because one booked-out Friday plus the
 * weekend read as a 3.7-day hole. A weekend, a public holiday or a single
 * full day is not leave; three of THEIR working days with nothing open is.
 * Without a calendar (older payload, unknown zone) the clock rule stands.
 */
export function findCoverGap(
  slots: readonly PublicSlot[],
  nowMs: number,
  calendar?: CoverCalendar | null,
): { startMs: number; endMs: number } | null {
  if (slots.length === 0) return null;
  const firstMs = new Date(slots[0].start).getTime();

  let isGap: (fromMs: number, toMs: number) => boolean;
  try {
    if (calendar && calendar.workingDays.length > 0) {
      localDayIndex(nowMs, calendar.schedulingZone); // throws on an unknown zone
      isGap = (fromMs, toMs) => emptyWorkingDaysBetween(fromMs, toMs, calendar) >= COVER_GAP_DAYS;
    } else {
      isGap = (fromMs, toMs) => toMs - fromMs > COVER_GAP_DAYS * DAY_MS;
    }
  } catch {
    isGap = (fromMs, toMs) => toMs - fromMs > COVER_GAP_DAYS * DAY_MS;
  }

  if (isGap(nowMs, firstMs)) return { startMs: nowMs, endMs: firstMs };

  let previous = firstMs;
  for (const slot of slots) {
    const current = new Date(slot.start).getTime();
    if (isGap(previous, current) && previous - nowMs < QUIET_WEEK_DAYS * DAY_MS) {
      return { startMs: previous, endMs: current };
    }
    previous = current;
  }
  return null;
}

/** A backup's times that actually help: inside the primary's gap when there
 *  is one, otherwise anything sooner than the primary's next opening. */
export function coverSlotsFor(
  entry: BackupEntry,
  primaryFirstMs: number | null,
  gapStartMs: number | null,
): PublicSlot[] {
  const inGap = entry.nextSlots.filter((slot) => new Date(slot.start).getTime() > (gapStartMs ?? Infinity));
  if (inGap.length > 0) return inGap;
  // No times inside the gap (or no gap): anything sooner than the primary
  // still helps — a backup with nothing useful yields nothing at all.
  return entry.nextSlots.filter(
    (slot) => primaryFirstMs === null || new Date(slot.start).getTime() < primaryFirstMs,
  );
}
