// SMS consent rules. These decide whether a real person's phone gets a text
// they never agreed to, so they are pinned rather than trusted.
// Run: node --experimental-strip-types --test src/lib/booking/sms-consent.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { maySendSms, requiresSmsConsent, smsConsentText } from "./sms-consent.ts";

test("the US-market brands collect consent; the AU ones do not", () => {
  assert.equal(requiresSmsConsent("US"), true);
  assert.equal(requiresSmsConsent("AU"), false);
  assert.equal(requiresSmsConsent(null), false);
  assert.equal(requiresSmsConsent(undefined), false);
});

test("a US brand may text only a guest who opted in", () => {
  assert.equal(maySendSms({ market: "US", smsOptIn: true }), true);
  assert.equal(maySendSms({ market: "US", smsOptIn: false }), false, "silence is not consent");
});

test("an AU brand keeps its existing brand-level behaviour", () => {
  assert.equal(maySendSms({ market: "AU", smsOptIn: false }), true);
});

test("the disclosure carries every element the US rules ask for", () => {
  const text = smsConsentText("Harriet Adventures", "https://harrietadventures.com/privacy-policy/");
  assert.match(text, /never use SMS for marketing purposes/i, "not marketing");
  assert.match(text, /Harriet Adventures/, "who is texting");
  assert.match(text, /not required as a condition/i, "consent is not a condition of booking");
  assert.match(text, /Message frequency varies/i, "how often");
  assert.match(text, /Message and data rates may apply/i, "cost");
  assert.match(text, /reply STOP/i, "how to stop");
  assert.match(text, /reply HELP/i, "how to get help");
  assert.match(text, /https:\/\/harrietadventures\.com\/privacy-policy\//, "privacy policy");
});

test("the disclosure names the brand it belongs to", () => {
  const salt = smsConsentText("Salt Caravan", "https://saltcaravan.com/privacy-policy/");
  assert.match(salt, /text messages from Salt Caravan/);
  assert.ok(!salt.includes("Harriet"));
});

test("a brand with no privacy policy on file still gets a valid disclosure", () => {
  const text = smsConsentText("Carex Garden Tours", null);
  assert.match(text, /reply STOP/i);
  assert.ok(!text.includes("Privacy Policy"), "no dangling link when there is no URL");
});
