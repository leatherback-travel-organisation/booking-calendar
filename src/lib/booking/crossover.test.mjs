import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCrossoverPingHtml,
  buildCrossoverSectionHtml,
  crossoverPingSubject,
  crossoverRelation,
} from "./crossover.ts";

const ctx = {
  guestName: "Avery <Guest>",
  brandName: "Carex Garden Tours",
  staffFullName: "Jacqueline Lancaster",
  eventTypeName: "Trip Enquiry",
  startsAtIso: "2026-08-24T09:00:00.000+10:00",
  airtableTripRecordId: "recTripCarex1",
  timezone: "Australia/Melbourne",
};

const lead = (overrides = {}) => ({
  crmRecordId: "crm1",
  status: "Strong Interest",
  tripRecordId: "recTripPatch1",
  tripTitle: "Sri Lanka 16 Days 2026 BAMORE",
  brandName: "Patch Adventures",
  bmName: "Claire Jakobi",
  bmEmail: "claire@patchadventures.com.au",
  ...overrides,
});

test("crossoverRelation distinguishes same trip, same brand and sister brand", () => {
  assert.equal(crossoverRelation(lead(), ctx), "different brand");
  assert.equal(
    crossoverRelation(lead({ brandName: "Carex Garden Tours", tripRecordId: "recOther" }), ctx),
    "same brand, different trip",
  );
  assert.equal(crossoverRelation(lead({ tripRecordId: "recTripCarex1" }), ctx), "this same trip");
});

test("crossover section lists each lead with stage, trip, owner and relation", () => {
  const html = buildCrossoverSectionHtml(
    [lead(), lead({ crmRecordId: "crm2", status: "Pending Deposit", brandName: "Carex Garden Tours", tripRecordId: "recOther", tripTitle: "Japan Gardens 2027", bmName: "Janie Welsh" })],
    ctx,
  );
  assert.ok(html.includes("Guest crossover"));
  assert.ok(html.includes("2 active leads in the Booking CRM"));
  assert.ok(html.includes("Strong Interest: Sri Lanka 16 Days 2026 BAMORE"));
  assert.ok(html.includes("Pending Deposit: Japan Gardens 2027"));
  assert.ok(html.includes("Claire Jakobi"));
  assert.ok(html.includes("different brand"));
  assert.ok(html.includes("same brand, different trip"));
  // Guest-supplied text is escaped before it reaches Help Scout HTML.
  assert.ok(html.includes("Avery &lt;Guest&gt;"));
  assert.ok(!html.includes("<Guest>"));
});

test("crossover section handles a lead with no trip attached", () => {
  const html = buildCrossoverSectionHtml([lead({ tripRecordId: null, tripTitle: null, brandName: null, bmName: null })], ctx);
  assert.ok(html.includes("trip not recorded"));
});

test("crossover section is empty when there is nothing to flag", () => {
  assert.equal(buildCrossoverSectionHtml([], ctx), "");
});

test("crossover ping tells the lead's BM who booked what, where and when", () => {
  const html = buildCrossoverPingHtml(lead(), ctx);
  assert.ok(html.includes("your Strong Interest lead for Sri Lanka 16 Days 2026 BAMORE"));
  assert.ok(html.includes("Jacqueline Lancaster"));
  assert.ok(html.includes("Carex Garden Tours"));
  assert.ok(html.includes("mon 24 aug"));
  assert.equal(crossoverPingSubject(ctx), "Crossover: Avery <Guest> booked with Carex Garden Tours");
});
