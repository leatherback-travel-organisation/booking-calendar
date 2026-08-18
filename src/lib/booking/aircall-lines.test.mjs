import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDigits, pickLine, regionForPhone } from "./aircall-lines.ts";

test("guest region is read from the dialling prefix", () => {
  assert.equal(regionForPhone("+64 21 555 123"), "NZ");
  assert.equal(regionForPhone("0064215551234"), "NZ");
  assert.equal(regionForPhone("+61 400 111 222"), "AU");
  assert.equal(regionForPhone("0400 111 222"), "AU");
  assert.equal(regionForPhone("+1 415 555 0100"), null);
});

const LINES = { phoneAu: "1300 123 456", phoneNz: "+64 9 555 0000", phoneDefault: "1300 123 456" };

test("NZ guests get the NZ line, AU guests the AU line, others the default", () => {
  assert.deepEqual(pickLine("+64 21 555 123", LINES), { region: "NZ", number: "+64 9 555 0000" });
  assert.deepEqual(pickLine("0400 111 222", LINES), { region: "AU", number: "1300 123 456" });
  assert.deepEqual(pickLine("+1 415 555 0100", LINES), { region: "default", number: "1300 123 456" });
});

test("a missing NZ line falls back to AU rather than nothing", () => {
  assert.deepEqual(pickLine("+64 21 555 123", { ...LINES, phoneNz: null }), { region: "AU", number: "1300 123 456" });
});

test("digit normalisation strips formatting and leading zeros for matching", () => {
  assert.equal(normalizeDigits("+64 (9) 555-0000"), "6495550000");
  assert.equal(normalizeDigits("0400 111 222"), "400111222");
});
