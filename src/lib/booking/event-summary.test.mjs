// Run: node --experimental-strip-types --test src/lib/booking/event-summary.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingEventSummary, groupSessionSummary } from "./event-summary.ts";

test("a call's title leads with the BM's first name", () => {
  assert.equal(
    bookingEventSummary({ bmFirstName: "Jax", eventTypeKey: "enquiry", eventTypeName: "Trip Inquiry", guestName: "Erin McGinnis", callMedium: "phone" }),
    "Jax · Trip Inquiry · Erin McGinnis (phone)",
  );
  assert.equal(
    bookingEventSummary({ bmFirstName: "Janie", eventTypeKey: "rhime", eventTypeName: "RHIME Call", guestName: "Nora", callMedium: "video", sourceKind: "portal" }),
    "Janie · Booking Call · Nora (portal)",
  );
});

test("a group session's title leads with the BM's first name too", () => {
  assert.equal(
    groupSessionSummary({ bmFirstName: "Jax", eventTypeName: "Pre-Trip Video Call", capacity: 8 }),
    "Jax · Pre-Trip Video Call (group) — 8 seats",
  );
});
