import assert from "node:assert/strict";
import test from "node:test";
import { defaultIso, toE164, OTHER_ISO } from "./dial-codes.ts";

// Guests type national numbers every which way; the stored value must always
// be dialable E.164 — SMS and AirCall both depend on it.
test("toE164 standardises national input", () => {
  assert.equal(toE164("AU", "0412 345 678"), "+61412345678");   // trunk zero dropped
  assert.equal(toE164("AU", "412-345-678"), "+61412345678");    // separators stripped
  assert.equal(toE164("GB", "07911 123456"), "+447911123456");
  assert.equal(toE164("US", "201 555 0123"), "+12015550123");   // no trunk zero to drop
});

test("toE164 keeps already-international input intact", () => {
  assert.equal(toE164("AU", "+61 412 345 678"), "+61412345678");
  // Full number for a DIFFERENT country than the dropdown — trust the +.
  assert.equal(toE164("AU", "+64 21 123 4567"), "+64211234567");
});

test("Other passes through with a + ensured", () => {
  assert.equal(toE164(OTHER_ISO, "+971 50 123 4567"), "+971501234567");
  assert.equal(toE164(OTHER_ISO, "971 50 123 4567"), "+971501234567");
});

test("defaultIso reads the browser region and falls back to AU", () => {
  assert.equal(defaultIso("en-NZ"), "NZ");
  assert.equal(defaultIso("de-DE"), "DE");
  assert.equal(defaultIso("en"), "AU");
  assert.equal(defaultIso(undefined), "AU");
  assert.equal(defaultIso("en-AQ"), "AU"); // region not in the list
});
