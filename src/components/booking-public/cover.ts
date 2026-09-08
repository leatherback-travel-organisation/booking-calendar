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

/** Where the backup's times belong. Nothing from the primary for a week or
 *  more puts them up with the times; anything sooner leaves them at the
 *  bottom, so the primary keeps the call whenever they can take it. */
export function backupPlacement(primaryFirstMs: number | null, nowMs: number): "with-times" | "bottom" {
  if (primaryFirstMs === null) return "with-times";
  return primaryFirstMs - nowMs >= QUIET_WEEK_DAYS * DAY_MS ? "with-times" : "bottom";
}

/**
 * The stretch of COVER_GAP_DAYS or more with nothing in it, starting within
 * the next week. Returns when it starts and when they are back.
 *
 * Two shapes count, and the second was missed until 8 Sep. Leave usually
 * begins in a day or two, leaving a hole BETWEEN two open times — that was
 * all this looked for. But once the leave actually starts there is nothing
 * before the hole any more, and the warm copy fell silent at exactly the
 * moment it was most true. So a hole running from NOW to the first opening
 * counts as well.
 */
export function findCoverGap(
  slots: readonly PublicSlot[],
  nowMs: number,
): { startMs: number; endMs: number } | null {
  if (slots.length === 0) return null;
  const gapMs = COVER_GAP_DAYS * DAY_MS;

  // Already away: the hole starts now and ends at their first opening.
  const firstMs = new Date(slots[0].start).getTime();
  if (firstMs - nowMs > gapMs) return { startMs: nowMs, endMs: firstMs };

  let previous = firstMs;
  for (const slot of slots) {
    const current = new Date(slot.start).getTime();
    if (current - previous > gapMs && previous - nowMs < QUIET_WEEK_DAYS * DAY_MS) {
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
