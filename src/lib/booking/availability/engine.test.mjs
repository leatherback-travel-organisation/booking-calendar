import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { computeSlots, mergeIntervals, rankByOpenSlots, resolveSchedulingZone } from "./engine.ts";

const WEEKDAYS_9_TO_5 = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMin: 540, endMin: 1020 }));

function base(overrides = {}) {
  return {
    schedulingZone: "Australia/Melbourne",
    workingHours: WEEKDAYS_9_TO_5,
    durationMin: 30,
    bufferMinutes: 0,
    minNoticeHours: 0,
    windowStart: "2026-08-17T00:00:00Z",
    windowEnd: "2026-08-24T00:00:00Z",
    now: "2026-08-10T00:00:00Z",
    busy: [],
    ...overrides,
  };
}

function localTimes(slots, zone) {
  return slots.map((s) => DateTime.fromISO(s.start).setZone(zone).toFormat("ccc HH:mm"));
}

// ---------------------------------------------------------------------------
// Brand-anchored timezones — the subtle ones first (§5.1a)
// ---------------------------------------------------------------------------

test("a Carex BM living in Colombia is bookable 09:00-17:00 America/Los_Angeles, not America/Bogota", () => {
  const slots = computeSlots(base({
    schedulingZone: "America/Los_Angeles",
    windowStart: "2026-08-18T00:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  // Tuesday 18 Aug 2026, PDT (UTC-7): 09:00 LA == 16:00Z. Bogota (UTC-5)
  // anchoring would put the first slot at 14:00Z instead.
  assert.equal(slots[0].start, "2026-08-18T16:00:00.000Z");
  const bogotaAnchored = DateTime.fromISO("2026-08-18T09:00:00", { zone: "America/Bogota" }).toUTC().toISO();
  assert.notEqual(slots[0].start, bogotaAnchored);
});

test("a Patch BM in Queensland works 09:00-17:00 Melbourne, which is 08:00-16:00 Brisbane during southern summer", () => {
  const slots = computeSlots(base({
    windowStart: "2027-01-10T12:00:00Z", // covers Monday 11 Jan, AEDT in force
    windowEnd: "2027-01-11T12:00:00Z",
  }));
  const brisbane = DateTime.fromISO(slots[0].start).setZone("Australia/Brisbane");
  assert.equal(brisbane.toFormat("HH:mm"), "08:00");
  const melbourne = DateTime.fromISO(slots[0].start).setZone("Australia/Melbourne");
  assert.equal(melbourne.toFormat("HH:mm"), "09:00");
});

test("moving a BM between brands changes their bookable hours", () => {
  const window = { windowStart: "2026-08-18T00:00:00Z", windowEnd: "2026-08-19T00:00:00Z" };
  const asPatch = computeSlots(base({ ...window, schedulingZone: "Australia/Melbourne" }));
  const asCarex = computeSlots(base({ ...window, schedulingZone: "America/Los_Angeles" }));
  assert.notDeepEqual(asPatch[0], asCarex[0]);
});

test("a staff timezone_override, when set, wins over the brand's zone", () => {
  assert.equal(
    resolveSchedulingZone({ timezoneOverride: "Pacific/Auckland" }, { schedulingTimezone: "Australia/Melbourne" }),
    "Pacific/Auckland",
  );
  assert.equal(
    resolveSchedulingZone({ timezoneOverride: null }, { schedulingTimezone: "Australia/Melbourne" }),
    "Australia/Melbourne",
  );
});

// ---------------------------------------------------------------------------
// DST
// ---------------------------------------------------------------------------

test("Melbourne spring forward (Sun 4 Oct 2026): the 02:00-02:59 hour does not exist and yields no slots", () => {
  const slots = computeSlots(base({
    workingHours: [{ dayOfWeek: 0, startMin: 60, endMin: 240 }], // Sunday 01:00-04:00
    windowStart: "2026-10-03T00:00:00Z",
    windowEnd: "2026-10-05T00:00:00Z",
  }));
  const times = localTimes(slots, "Australia/Melbourne");
  assert.deepEqual(times, ["Sun 01:00", "Sun 01:30", "Sun 03:00", "Sun 03:30"]);
});

test("Melbourne fall back (Sun 4 Apr 2027): the repeated 02:00 hour yields the correct number of slots, not double", () => {
  const slots = computeSlots(base({
    workingHours: [{ dayOfWeek: 0, startMin: 60, endMin: 240 }],
    windowStart: "2027-04-03T00:00:00Z",
    windowEnd: "2027-04-05T00:00:00Z",
  }));
  const times = localTimes(slots, "Australia/Melbourne");
  assert.deepEqual(times, ["Sun 01:00", "Sun 01:30", "Sun 02:00", "Sun 02:30", "Sun 03:00", "Sun 03:30"]);
});

test("Los Angeles spring forward (Sun 8 Mar 2026) is handled identically", () => {
  const slots = computeSlots(base({
    schedulingZone: "America/Los_Angeles",
    workingHours: [{ dayOfWeek: 0, startMin: 60, endMin: 240 }],
    windowStart: "2026-03-07T00:00:00Z",
    windowEnd: "2026-03-09T12:00:00Z",
    now: "2026-03-01T00:00:00Z",
  }));
  const times = localTimes(slots, "America/Los_Angeles");
  assert.deepEqual(times, ["Sun 01:00", "Sun 01:30", "Sun 03:00", "Sun 03:30"]);
});

test("the AU/US 9am gap swings 17→18→19 hours across the October and November transitions", () => {
  // Both zones' 09:00 on the same local Monday; measure the instant gap.
  function gapHours(isoDate) {
    const melb = DateTime.fromISO(`${isoDate}T09:00:00`, { zone: "Australia/Melbourne" });
    const la = DateTime.fromISO(`${isoDate}T09:00:00`, { zone: "America/Los_Angeles" });
    return (la.toMillis() - melb.toMillis()) / 3_600_000;
  }
  assert.equal(gapHours("2026-09-28"), 17); // AEST vs PDT
  assert.equal(gapHours("2026-10-26"), 18); // AEDT vs PDT
  assert.equal(gapHours("2026-11-09"), 19); // AEDT vs PST
  // And back the other way in March/April 2027.
  assert.equal(gapHours("2027-03-01"), 19); // AEDT vs PST
  assert.equal(gapHours("2027-03-22"), 18); // AEDT vs PDT
  assert.equal(gapHours("2027-04-12"), 17); // AEST vs PDT
});

test("a guest in Sydney sees the correct local time for a slot defined in Pacific", () => {
  const slots = computeSlots(base({
    schedulingZone: "America/Los_Angeles",
    windowStart: "2026-08-18T00:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  // 09:00 Tue in LA (PDT) is 02:00 Wed in Sydney (AEST).
  const sydney = DateTime.fromISO(slots[0].start).setZone("Australia/Sydney");
  assert.equal(sydney.toFormat("ccc HH:mm"), "Wed 02:00");
});

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

test("9-5 Mon-Fri with 30-min slots yields 16 slots per day, 80 per week", () => {
  const slots = computeSlots(base({
    windowStart: "2026-08-16T14:00:00Z", // Sunday midnight Melbourne
    windowEnd: "2026-08-23T14:00:00Z",
  }));
  assert.equal(slots.length, 80);
  const monday = slots.filter((s) => DateTime.fromISO(s.start).setZone("Australia/Melbourne").weekday === 1);
  assert.equal(monday.length, 16);
});

test("a 45-minute event type never produces a slot ending after close", () => {
  const slots = computeSlots(base({
    durationMin: 45,
    windowStart: "2026-08-17T12:00:00Z", // covers all of Tuesday 18 Aug local
    windowEnd: "2026-08-18T12:00:00Z",
  }));
  assert.equal(slots.length, 15); // last start 16:00, ends 16:45
  for (const slot of slots) {
    const end = DateTime.fromISO(slot.end).setZone("Australia/Melbourne");
    assert.ok(end.hour < 17 || (end.hour === 17 && end.minute === 0), `slot ends after close: ${slot.end}`);
  }
});

test("split working hours (9-12 and 14-17) produce no slots in the gap", () => {
  const slots = computeSlots(base({
    workingHours: [
      { dayOfWeek: 2, startMin: 540, endMin: 720 },
      { dayOfWeek: 2, startMin: 840, endMin: 1020 },
    ],
    windowStart: "2026-08-17T12:00:00Z",
    windowEnd: "2026-08-18T12:00:00Z",
  }));
  const hours = slots.map((s) => DateTime.fromISO(s.start).setZone("Australia/Melbourne").hour);
  assert.ok(hours.every((h) => (h >= 9 && h < 12) || (h >= 14 && h < 17)));
  assert.equal(slots.length, 6 + 6);
});

// ---------------------------------------------------------------------------
// Buffer and notice
// ---------------------------------------------------------------------------

test("a 15-min buffer removes the slots either side of a busy block, not just the overlap", () => {
  // Busy 12:00-13:00 Melbourne on Tue 18 Aug (02:00-03:00Z).
  const slots = computeSlots(base({
    bufferMinutes: 15,
    busy: [{ start: "2026-08-18T02:00:00Z", end: "2026-08-18T03:00:00Z" }],
    windowStart: "2026-08-18T00:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  const times = localTimes(slots, "Australia/Melbourne");
  assert.ok(!times.includes("Tue 11:30"), "11:30 slot brushes the buffer and must go");
  assert.ok(!times.includes("Tue 12:00") && !times.includes("Tue 12:30"), "overlapping slots must go");
  assert.ok(!times.includes("Tue 13:00"), "13:00 slot starts inside the trailing buffer");
  assert.ok(times.includes("Tue 11:00"), "11:00 ends at 11:30, clear of the 11:45 buffer edge");
  assert.ok(times.includes("Tue 13:30"), "13:30 starts after the 13:15 buffer edge");
});

test("zero buffer produces back-to-back slots around a busy block", () => {
  const slots = computeSlots(base({
    busy: [{ start: "2026-08-18T02:00:00Z", end: "2026-08-18T03:00:00Z" }],
    windowStart: "2026-08-18T00:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  const times = localTimes(slots, "Australia/Melbourne");
  assert.ok(times.includes("Tue 11:30"), "slot ending exactly at busy start survives");
  assert.ok(times.includes("Tue 13:00"), "slot starting exactly at busy end survives");
  assert.ok(!times.includes("Tue 12:00") && !times.includes("Tue 12:30"));
});

test("4-hour minimum notice removes today's early slots at 10am but not at 5am", () => {
  // now = 10:00 Melbourne Tue → cutoff 14:00: morning gone.
  const atTen = computeSlots(base({
    minNoticeHours: 4,
    now: "2026-08-18T00:00:00Z",
    windowStart: "2026-08-18T00:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  assert.equal(localTimes(atTen, "Australia/Melbourne")[0], "Tue 14:00");
  // now = 05:00 Melbourne → cutoff 09:00: the 09:00 slot survives.
  const atFive = computeSlots(base({
    minNoticeHours: 4,
    now: "2026-08-17T19:00:00Z",
    windowStart: "2026-08-17T19:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  assert.equal(localTimes(atFive, "Australia/Melbourne")[0], "Tue 09:00");
});

test("holds and confirmed bookings both block their slots", () => {
  const slots = computeSlots(base({
    holds: [{ start: "2026-08-18T00:00:00Z", end: "2026-08-18T00:30:00Z" }], // 10:00 local
    confirmed: [{ start: "2026-08-18T01:00:00Z", end: "2026-08-18T01:30:00Z" }], // 11:00 local
    windowStart: "2026-08-18T00:00:00Z",
    windowEnd: "2026-08-19T00:00:00Z",
  }));
  const times = localTimes(slots, "Australia/Melbourne");
  assert.ok(!times.includes("Tue 10:00"));
  assert.ok(!times.includes("Tue 11:00"));
  assert.ok(times.includes("Tue 10:30"));
});

test("invalid inputs return no slots instead of throwing", () => {
  assert.deepEqual(computeSlots(base({ schedulingZone: "Not/AZone" })), []);
  assert.deepEqual(computeSlots(base({ windowEnd: "2020-01-01T00:00:00Z" })), []);
  assert.deepEqual(computeSlots(base({ busy: [{ start: "garbage", end: "also garbage" }] })).length > 0, true);
});

// ---------------------------------------------------------------------------
// Ranking and merging
// ---------------------------------------------------------------------------

test("backups rank by open-slot count with stable tie-breaks, never by any booking counter", () => {
  const slot = (h) => ({ start: `2026-08-18T0${h}:00:00.000Z`, end: `2026-08-18T0${h}:30:00.000Z` });
  const ranked = rankByOpenSlots([
    { name: "Claire", slots: [slot(1)] },
    { name: "Tegan", slots: [slot(1), slot(2), slot(3)] },
    { name: "Aidan", slots: [slot(2)] },
    { name: "Mandy", slots: [slot(1)] },
  ]);
  assert.deepEqual(ranked.map((c) => c.name), ["Tegan", "Claire", "Mandy", "Aidan"]);
});

test("mergeIntervals coalesces overlapping and touching intervals", () => {
  const merged = mergeIntervals([
    { start: "2026-08-18T01:00:00Z", end: "2026-08-18T02:00:00Z" },
    { start: "2026-08-18T01:30:00Z", end: "2026-08-18T02:30:00Z" },
    { start: "2026-08-18T02:30:00Z", end: "2026-08-18T03:00:00Z" },
    { start: "2026-08-18T05:00:00Z", end: "2026-08-18T06:00:00Z" },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].start, "2026-08-18T01:00:00.000Z");
  assert.equal(merged[0].end, "2026-08-18T03:00:00.000Z");
});
