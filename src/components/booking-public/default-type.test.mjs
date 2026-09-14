// Which call type a booking link opens on. The online brands (Salt Caravan,
// Carex) default to a Quick Chat rather than the 30-minute Trip Inquiry, and
// that lives on the brand record so it holds for links we did not build.
// Run: node --experimental-strip-types --test src/components/booking-public/default-type.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultEventTypeKey } from "./default-type.ts";

const TYPES = [{ key: "enquiry" }, { key: "feedback" }, { key: "chat" }];

test("an explicit ?type= always wins", () => {
  assert.equal(defaultEventTypeKey(TYPES, "feedback", "chat"), "feedback");
  assert.equal(defaultEventTypeKey(TYPES, "enquiry", "chat"), "enquiry");
});

test("without a type, the brand's own default is used", () => {
  assert.equal(defaultEventTypeKey(TYPES, null, "chat"), "chat");
});

test("a brand naming no default keeps the old behaviour", () => {
  assert.equal(defaultEventTypeKey(TYPES, null, null), "enquiry");
  assert.equal(defaultEventTypeKey(TYPES, null), "enquiry");
});

test("a default the brand does not actually offer is ignored, not shown broken", () => {
  assert.equal(defaultEventTypeKey(TYPES, null, "lead-up"), "enquiry");
  assert.equal(defaultEventTypeKey([{ key: "feedback" }], null, "chat"), "feedback");
});

test("an unknown ?type= falls through to the brand default", () => {
  assert.equal(defaultEventTypeKey(TYPES, "nonsense", "chat"), "chat");
});

test("no types at all yields nothing rather than throwing", () => {
  assert.equal(defaultEventTypeKey([], null, "chat"), null);
});
