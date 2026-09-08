// Cover rules: when the "off on an adventure" copy fires, and where the
// backup's times sit. Both are judgements about someone's calendar that fail
// SILENTLY when wrong — the page just says something blander — so they are
// pinned here rather than left to be noticed on the live site.
// Run: node --experimental-strip-types --test src/components/booking-public/cover.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { backupPlacement, coverSlotsFor, findCoverGap } from "./cover.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-08T00:00:00Z");

/** Slots every day from `fromDay` to `toDay` (inclusive), offset from NOW. */
function slotsOnDays(...dayOffsets) {
  return dayOffsets.map((offset) => ({
    start: new Date(NOW + offset * DAY).toISOString(),
    end: new Date(NOW + offset * DAY + 1_800_000).toISOString(),
  }));
}

test("no gap when the BM is available steadily", () => {
  assert.equal(findCoverGap(slotsOnDays(1, 2, 3, 4, 5), NOW), null);
});

test("a hole between two open times is a gap — leave that starts in a day or two", () => {
  const gap = findCoverGap(slotsOnDays(1, 14, 15), NOW);
  assert.ok(gap, "a fortnight between openings is leave-shaped");
  assert.equal(new Date(gap.startMs).toISOString(), new Date(NOW + 1 * DAY).toISOString());
  assert.equal(new Date(gap.endMs).toISOString(), new Date(NOW + 14 * DAY).toISOString());
});

test("leave that has ALREADY started still counts as a gap", () => {
  // The bug found on 8 Sep: with nothing before the hole there was no pair of
  // slots to sit either side of it, so the warm copy fell silent at exactly
  // the moment it was most true. The hole now runs from now to the return.
  const gap = findCoverGap(slotsOnDays(13, 14, 15), NOW);
  assert.ok(gap, "a BM already away must still get the adventure copy");
  assert.equal(gap.startMs, NOW, "the hole starts now");
  assert.equal(new Date(gap.endMs).toISOString(), new Date(NOW + 13 * DAY).toISOString());
});

test("a next opening just over the threshold is a gap; just under is not", () => {
  assert.ok(findCoverGap(slotsOnDays(3.5), NOW), "more than three days out reads as away");
  assert.equal(findCoverGap(slotsOnDays(2.5), NOW), null, "a busy couple of days is not leave");
});

test("no slots at all yields no gap — there is no return date to name", () => {
  assert.equal(findCoverGap([], NOW), null);
});

test("a hole that opens beyond the next week is left alone", () => {
  // Leave a fortnight out is not what a guest booking this week needs told,
  // so the hole has to START within the week to count.
  assert.equal(findCoverGap(slotsOnDays(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30), NOW), null);
  // The same shape a few days earlier does count.
  assert.ok(findCoverGap(slotsOnDays(1, 2, 3, 30), NOW));
});

test("the backup goes with the times when the primary is quiet for a week or more", () => {
  assert.equal(backupPlacement(NOW + 7 * DAY, NOW), "with-times");
  assert.equal(backupPlacement(NOW + 13 * DAY, NOW), "with-times");
  assert.equal(backupPlacement(null, NOW), "with-times", "no times at all is the loudest case");
});

test("the backup waits at the bottom while the primary can still take the call", () => {
  assert.equal(backupPlacement(NOW + 1 * DAY, NOW), "bottom");
  assert.equal(backupPlacement(NOW + 6.9 * DAY, NOW), "bottom");
});

test("the backup's offered times fall inside the primary's gap", () => {
  const entry = { nextSlots: slotsOnDays(2, 4, 6) };
  const inGap = coverSlotsFor(entry, NOW + 13 * DAY, NOW);
  assert.equal(inGap.length, 3, "every one of the backup's times helps during the absence");
});

test("with no gap, only the backup's times sooner than the primary's are offered", () => {
  const entry = { nextSlots: slotsOnDays(2, 20) };
  const sooner = coverSlotsFor(entry, NOW + 5 * DAY, null);
  assert.equal(sooner.length, 1, "a backup free later than the primary is no help");
});
