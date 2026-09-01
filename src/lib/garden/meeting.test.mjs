import assert from "node:assert/strict";
import test from "node:test";

import { comfortBand, findBestMeetingSlot, suggestOmissions } from "./meeting.ts";

const SYD = "Australia/Sydney";
const BEL = "Europe/Belgrade";

const att = (email, timezone, busy = []) => ({ email, timezone, busy });

test("earliest same-timezone comfortable slot lands on the next half-hour", () => {
  // Tue 1 Sep 2026 10:05 Sydney = 00:05 UTC (AEST +10).
  const slot = findBestMeetingSlot({
    fromIso: "2026-09-01T00:05:00Z",
    horizonDays: 5,
    durationMinutes: 30,
    attendees: [att("a@x.com", SYD), att("b@x.com", SYD)],
  });
  assert.equal(slot?.startIso, "2026-09-01T00:30:00.000Z");
  assert.equal(slot?.tier, 0);
});

test("cross-timezone groups meet in funny hours when 9-5s never overlap", () => {
  // Sydney 9-17 = 23:00–07:00 UTC; Belgrade 9-17 = 07:00–15:00 UTC (Sept).
  // No fully comfortable slot exists, so the group stretches: the best
  // overlap keeps Belgrade comfortable while Sydney runs late (17:00-20:00
  // local = 07:00-10:00 UTC) or early Belgrade / Sydney afternoon.
  const slot = findBestMeetingSlot({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees: [att("syd@x.com", SYD), att("bel@x.com", BEL)],
  });
  assert.ok(slot, "a stretched slot should be found");
  assert.equal(slot.tier, 1);
  const bands = new Map(slot.perAttendee.map((entry) => [entry.email, entry.band]));
  // Earliest shoulder overlap from midnight UTC: Sydney 16:00-ish is comfortable
  // until 17:00; Belgrade early from 07:00. 05:00 UTC = Syd 15:00 ✓ / Bel 07:00
  // early — first candidate where both are bookable.
  assert.equal(slot.startIso, "2026-09-01T05:00:00.000Z");
  assert.equal(bands.get("syd@x.com"), "comfortable");
  assert.equal(bands.get("bel@x.com"), "early");
});

test("a comfortable-for-all slot beats an earlier stretched one", () => {
  // One Sydney attendee busy all of today's business hours; tomorrow is free.
  // A stretched slot tonight (19:00) exists, but tomorrow 9:00 is comfortable —
  // comfort wins over soonness.
  const busyAllDay = [{ start: "2026-08-31T23:00:00Z", end: "2026-09-01T07:00:00Z" }];
  const slot = findBestMeetingSlot({
    fromIso: "2026-08-31T23:00:00Z",
    horizonDays: 5,
    durationMinutes: 30,
    attendees: [att("a@x.com", SYD, busyAllDay), att("b@x.com", SYD)],
  });
  // Tue 2 Sep 09:00 Sydney = 1 Sep 23:00 UTC.
  assert.equal(slot?.startIso, "2026-09-01T23:00:00.000Z");
  assert.equal(slot?.tier, 0);
});

test("nights and weekends are never booked", () => {
  // Force the window to a single weekend day: nothing should be found.
  const slot = findBestMeetingSlot({
    fromIso: "2026-09-05T00:00:00Z",
    horizonDays: 1,
    durationMinutes: 30,
    attendees: [att("a@x.com", SYD)],
  });
  assert.equal(slot, null);
});

test("comfort bands classify local hours", () => {
  // 1 Sep 2026, Sydney local: 08:00 = 22:00 UTC prev day.
  const day = (hour, minute = 0) => Date.parse("2026-08-31T14:00:00Z") + (hour * 60 + minute) * 60000; // 2026-09-01 00:00 Sydney
  assert.equal(comfortBand(day(10), day(10, 30), SYD), "comfortable");
  assert.equal(comfortBand(day(8), day(8, 30), SYD), "early");
  assert.equal(comfortBand(day(18), day(18, 30), SYD), "late");
  assert.equal(comfortBand(day(21), day(21, 30), SYD), "rough");
  assert.equal(comfortBand(day(23), day(23, 30), SYD), null);
});

test("omitting the lone remote attendee is suggested when it lifts everyone to comfortable", () => {
  const attendees = [att("a@x.com", SYD), att("b@x.com", SYD), att("bel@x.com", BEL)];
  const full = findBestMeetingSlot({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees,
  });
  assert.ok(full && full.tier > 0);
  const options = suggestOmissions({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees,
    fullGroupSlot: full,
  });
  assert.ok(options.length >= 1);
  assert.equal(options[0].omitEmail, "bel@x.com");
  assert.equal(options[0].slot.tier, 0);
});

test("no omissions are suggested when everyone is already comfortable", () => {
  const attendees = [att("a@x.com", SYD), att("b@x.com", SYD), att("c@x.com", SYD)];
  const full = findBestMeetingSlot({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees,
  });
  assert.equal(full?.tier, 0);
  const options = suggestOmissions({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees,
    fullGroupSlot: full,
  });
  assert.equal(options.length, 0);
});

test("two-person meetings never suggest dropping someone", () => {
  const attendees = [att("syd@x.com", SYD), att("bel@x.com", BEL)];
  const options = suggestOmissions({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees,
    fullGroupSlot: null,
  });
  assert.equal(options.length, 0);
});
