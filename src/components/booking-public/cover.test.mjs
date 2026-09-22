// Cover rules: when the "off on an adventure" copy fires, and where the
// backup's times sit. Both are judgements about someone's calendar that fail
// SILENTLY when wrong — the page just says something blander — so they are
// pinned here rather than left to be noticed on the live site.
// Run: node --experimental-strip-types --test src/components/booking-public/cover.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { backupPlacement, coverSlotsFor, emptyWorkingDaysBetween, findCoverGap } from "./cover.ts";

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

test("the backup always leads, whatever the primary has open (Nicola, 15 Sep)", () => {
  assert.equal(backupPlacement(NOW + 7 * DAY, NOW), "with-times");
  assert.equal(backupPlacement(NOW + 13 * DAY, NOW), "with-times");
  assert.equal(backupPlacement(null, NOW), "with-times", "no times at all is the loudest case");
  assert.equal(backupPlacement(NOW + 1 * DAY, NOW), "with-times");
  assert.equal(backupPlacement(NOW + 6.9 * DAY, NOW), "with-times");
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

// ---------------------------------------------------------------------------
// Gaps measured in the BM's working days (22 Sep) — the Janie false alarm
// ---------------------------------------------------------------------------

// Janie: Los Angeles, Monday–Friday. Slot instants are her local 10:00.
const LA = { schedulingZone: "America/Los_Angeles", workingDays: [1, 2, 3, 4, 5] };
const la10 = (isoDate) => ({ start: `${isoDate}T17:00:00.000Z`, end: `${isoDate}T17:30:00.000Z` }); // 10:00 PDT
const NOW_TUE = Date.parse("2026-09-22T03:45:00Z"); // Mon 20:45 PDT — what the live page saw

test("one booked-out Friday plus the weekend is NOT leave (the 22 Sep false alarm)", () => {
  const slots = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-28", "2026-09-29"].map(la10); // no Fri 25
  assert.equal(findCoverGap(slots, NOW_TUE, LA), null, "Thu → Mon is one empty working day, not an adventure");
  assert.ok(findCoverGap(slots, NOW_TUE), "the old clock rule DID fire on this shape — the bug being fixed");
});

test("a public-holiday Monday is not leave either", () => {
  const slots = ["2026-09-24", "2026-09-25", "2026-09-29", "2026-09-30"].map(la10); // Fri → Tue
  assert.equal(findCoverGap(slots, NOW_TUE, LA), null);
});

test("three empty working days IS leave, weekend or not", () => {
  // Thu open, then nothing until the following Thu: Fri, Mon, Tue, Wed empty.
  const gap = findCoverGap(["2026-09-24", "2026-10-01"].map(la10), NOW_TUE, LA);
  assert.ok(gap);
  assert.equal(new Date(gap.endMs).toISOString(), "2026-10-01T17:00:00.000Z");
  // Mon–Wed off between a Friday and a Thursday: exactly three.
  assert.ok(findCoverGap(["2026-09-25", "2026-10-01"].map(la10), NOW_TUE, LA));
  // Two empty working days across a weekend (Thu → Tue) stay quiet.
  assert.equal(findCoverGap(["2026-09-24", "2026-09-29"].map(la10), NOW_TUE, LA), null);
});

test("leave already under way counts from today in working days", () => {
  const tueMorningLa = Date.parse("2026-09-22T17:45:00Z"); // Tue 10:45 PDT
  // Tuesday now, first opening next Monday: Wed, Thu, Fri empty → away.
  assert.ok(findCoverGap(["2026-09-28"].map(la10), tueMorningLa, LA));
  // Tuesday now, first opening Friday: Wed, Thu empty → just a busy week.
  assert.equal(findCoverGap(["2026-09-25"].map(la10), tueMorningLa, LA), null);
  // NOW_TUE is still Monday EVENING in Los Angeles: Tue, Wed, Thu empty before a Friday opening → away.
  assert.ok(findCoverGap(["2026-09-25"].map(la10), NOW_TUE, LA));
});

test("a part-time week is measured in ITS working days", () => {
  const monWed = { schedulingZone: "Australia/Melbourne", workingDays: [1, 2, 3] };
  const mel10 = (isoDate) => ({ start: `${isoDate}T00:00:00.000Z`, end: `${isoDate}T00:30:00.000Z` }); // 10:00 AEST
  // Wed open, next Mon open: Thu–Sun are not her days → no gap.
  assert.equal(findCoverGap(["2026-09-23", "2026-09-28"].map(mel10), NOW_TUE, monWed), null);
  // Wed open, then nothing until the Monday after next: Mon, Tue, Wed empty → gap.
  assert.ok(findCoverGap(["2026-09-23", "2026-10-05"].map(mel10), NOW_TUE, monWed));
});

test("emptyWorkingDaysBetween counts local dates in the scheduling zone", () => {
  // Thu 24 Sep 10:00 PDT → Mon 28 Sep 10:00 PDT: Fri only.
  assert.equal(emptyWorkingDaysBetween(Date.parse("2026-09-24T17:00:00Z"), Date.parse("2026-09-28T17:00:00Z"), LA), 1);
  // Same instants for a Monday-to-Thursday week: Friday is not hers, so zero.
  assert.equal(emptyWorkingDaysBetween(Date.parse("2026-09-24T17:00:00Z"), Date.parse("2026-09-28T17:00:00Z"), { ...LA, workingDays: [1, 2, 3, 4] }), 0);
});

test("an unknown zone falls back to the clock rule rather than crashing", () => {
  const bad = { schedulingZone: "Mars/Olympus", workingDays: [1, 2, 3, 4, 5] };
  assert.equal(findCoverGap(slotsOnDays(1, 2, 3), NOW, bad), null);
  assert.ok(findCoverGap(slotsOnDays(1, 14), NOW, bad));
});
