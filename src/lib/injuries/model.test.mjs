import assert from "node:assert/strict";
import test from "node:test";

import { isValidInjuryDate, isValidInjurySourceRecord } from "./model.ts";

test("injury dates must be real ISO calendar dates", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(isValidInjuryDate("2026-07-15", now), true);
  assert.equal(isValidInjuryDate("2024-02-29", now), true);
  assert.equal(isValidInjuryDate("2026-02-29", now), false);
  assert.equal(isValidInjuryDate("2026-02-31", now), false);
  assert.equal(isValidInjuryDate("15/07/2026", now), false);
});

test("injury dates cannot be in the future", () => {
  const now = new Date("2026-07-15T23:59:59.000Z");
  assert.equal(isValidInjuryDate("2026-07-16", now), false);
});

test("source reports require real dates and non-placeholder details", () => {
  const now = new Date("2026-07-15T23:59:59.000Z");
  assert.equal(isValidInjurySourceRecord({
    dateOfInjury: "2026-07-14",
    dateOfSubmission: "2026-07-15T09:30:00.000Z",
    nature: "Sprained ankle",
  }, now), true);
  assert.equal(isValidInjurySourceRecord({
    dateOfInjury: "2026-02-31",
    dateOfSubmission: "2026-07-15T09:30:00.000Z",
    nature: "Sprained ankle",
  }, now), false);
  assert.equal(isValidInjurySourceRecord({
    dateOfInjury: "2026-07-14",
    dateOfSubmission: "2026-07-15 09:30:00",
    nature: "Sprained ankle",
  }, now), false);
  assert.equal(isValidInjurySourceRecord({
    dateOfInjury: "2026-07-14",
    dateOfSubmission: "2026-07-15",
    nature: "   ",
  }, now), false);
});
