import assert from "node:assert/strict";
import test from "node:test";

import { findMeetingSlot } from "./meeting.ts";

const SYD = "Australia/Sydney";
const BEL = "Europe/Belgrade";

test("earliest same-timezone slot lands on the next half-hour inside working hours", () => {
  // Tue 1 Sep 2026 10:05 Sydney = 00:05 UTC (AEST +10).
  const slot = findMeetingSlot({
    fromIso: "2026-09-01T00:05:00Z",
    horizonDays: 5,
    durationMinutes: 30,
    attendees: [
      { email: "a@x.com", timezone: SYD, busy: [] },
      { email: "b@x.com", timezone: SYD, busy: [] },
    ],
  });
  assert.equal(slot?.startIso, "2026-09-01T00:30:00.000Z");
});

test("cross-timezone slots respect both working windows", () => {
  // Sydney (UTC+10) 9-17 = 23:00–07:00 UTC; Belgrade (UTC+2, CEST) 9-17 =
  // 07:00–15:00 UTC. The only shared instant is exactly 07:00 UTC — a 30-min
  // meeting cannot fit (Sydney's day ends at 07:00). Nothing should be found.
  const slot = findMeetingSlot({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 3,
    durationMinutes: 30,
    attendees: [
      { email: "syd@x.com", timezone: SYD, busy: [] },
      { email: "bel@x.com", timezone: BEL, busy: [] },
    ],
  });
  assert.equal(slot, null);
});

test("busy intervals push the slot later", () => {
  const slot = findMeetingSlot({
    fromIso: "2026-09-01T00:00:00Z",
    horizonDays: 5,
    durationMinutes: 30,
    attendees: [
      {
        email: "a@x.com",
        timezone: SYD,
        // Busy 10:00–11:00 Sydney (00:00–01:00 UTC).
        busy: [{ start: "2026-09-01T00:00:00Z", end: "2026-09-01T01:00:00Z" }],
      },
      { email: "b@x.com", timezone: SYD, busy: [] },
    ],
  });
  assert.equal(slot?.startIso, "2026-09-01T01:00:00.000Z");
});

test("weekends are skipped", () => {
  // Sat 5 Sep 2026 00:00 UTC (Sat 10:00 Sydney) → next slot Monday 9:00 Sydney
  // = Sunday 23:00 UTC.
  const slot = findMeetingSlot({
    fromIso: "2026-09-05T00:00:00Z",
    horizonDays: 5,
    durationMinutes: 30,
    attendees: [{ email: "a@x.com", timezone: SYD, busy: [] }],
  });
  assert.equal(slot?.startIso, "2026-09-06T23:00:00.000Z");
});

test("no attendees means no slot", () => {
  assert.equal(
    findMeetingSlot({ fromIso: "2026-09-01T00:00:00Z", horizonDays: 5, durationMinutes: 30, attendees: [] }),
    null,
  );
});
