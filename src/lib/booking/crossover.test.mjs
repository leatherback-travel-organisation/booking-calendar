import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCrossoverPingHtml,
  buildCrossoverSectionHtml,
  crossoverRelation,
} from "./crossover.ts";

const ctx = {
  guestName: "Avery <Guest>",
  brandKey: "carex",
  brandName: "Carex Garden Tours",
  staffFullName: "Jacqueline Lancaster",
  eventTypeName: "Trip Enquiry",
  startsAtIso: "2026-08-24T09:00:00.000+10:00",
  tripSlug: "japan-gardens",
  timezone: "Australia/Melbourne",
};

const row = (overrides = {}) => ({
  bookingId: "b2",
  startsAtIso: "2026-08-25T10:00:00.000+10:00",
  eventTypeName: "RHIME Call",
  brandKey: "patch",
  brandName: "Patch Adventures",
  staffFullName: "Claire Jakobi",
  staffEmail: "claire@patchadventures.com.au",
  tripSlug: "sri-lanka-adventure",
  helpscoutConversationId: "123",
  ...overrides,
});

test("crossoverRelation distinguishes brand and trip overlap", () => {
  assert.equal(crossoverRelation(row(), ctx), "different brand");
  assert.equal(
    crossoverRelation(row({ brandKey: "carex", tripSlug: "another-trip" }), ctx),
    "same brand, different trip",
  );
  assert.equal(crossoverRelation(row({ brandKey: "carex", tripSlug: "japan-gardens" }), ctx), "same trip");
  assert.equal(crossoverRelation(row({ brandKey: "carex", tripSlug: null }), ctx), "same brand");
});

test("crossover section lists every booking with its BM and relation", () => {
  const html = buildCrossoverSectionHtml([row(), row({ bookingId: "b3", brandKey: "carex", tripSlug: "x" })], ctx);
  assert.ok(html.includes("Guest crossover"));
  assert.ok(html.includes("2 other active bookings"));
  assert.ok(html.includes("Claire Jakobi"));
  assert.ok(html.includes("different brand"));
  assert.ok(html.includes("same brand, different trip"));
  // Guest-supplied text is escaped before it reaches Help Scout HTML.
  assert.ok(html.includes("Avery &lt;Guest&gt;"));
  assert.ok(!html.includes("<Guest>"));
});

test("crossover section is empty when there is nothing to flag", () => {
  assert.equal(buildCrossoverSectionHtml([], ctx), "");
});

test("crossover ping names the new booking, BM, brand and time", () => {
  const html = buildCrossoverPingHtml(ctx);
  assert.ok(html.includes("just booked a Trip Enquiry"));
  assert.ok(html.includes("Jacqueline Lancaster"));
  assert.ok(html.includes("Carex Garden Tours"));
  assert.ok(html.includes("japan-gardens"));
  assert.ok(html.includes("mon 24 aug"));
});
