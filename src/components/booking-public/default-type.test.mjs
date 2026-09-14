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

// Guests are never offered a kind of call (Nicola, 14 Sep): the booking flow
// carries no type chooser, and every brand row names its default in the
// migrations (online -> chat, adventure -> enquiry).
import { readFileSync } from "node:fs";

test("the guest booking flow has no call-type chooser", () => {
  const flow = readFileSync(new URL("./BookingFlow.tsx", import.meta.url), "utf8");
  assert.ok(!/What kind of call/.test(flow));
  assert.ok(!/typeChooser/.test(flow));
  assert.ok(!/pickEventType/.test(flow));
});

test("every brand row names its default call type", () => {
  const m067 = readFileSync(new URL("../../../db/067_brand_default_event_type.sql", import.meta.url), "utf8");
  const m068 = readFileSync(new URL("../../../db/068_every_brand_names_its_call_type.sql", import.meta.url), "utf8");
  assert.match(m067, /set default_event_type_key = 'chat' where key in \('salt-caravan', 'carex'\)/);
  assert.match(m068, /set default_event_type_key = 'enquiry'\s+where default_event_type_key is null/);
});
