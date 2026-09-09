// US spelling for the US-market brands' guest copy (Nicola, 9 Sep).
// Run: node --experimental-strip-types --test src/lib/booking/english.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { toAmericanEnglish, usesAmericanEnglish } from "./english.ts";

test("only the US-market brands are American", () => {
  for (const key of ["carex", "salt-caravan", "harriet"]) assert.equal(usesAmericanEnglish(key), true, key);
  for (const key of ["patch", "camino-women", "fencox", "magnificent-explorers", null, undefined]) {
    assert.equal(usesAmericanEnglish(key), false, String(key));
  }
});

test("the spellings actually found in the brands' templates are corrected", () => {
  assert.equal(
    toAmericanEnglish("Your call on {{booking.meeting_date}} has been cancelled"),
    "Your call on {{booking.meeting_date}} has been canceled",
  );
  assert.equal(
    toAmericanEnglish("Bring your favourite moment, and anything we could have done better."),
    "Bring your favorite moment, and anything we could have done better.",
  );
});

test("capitalisation is preserved", () => {
  assert.equal(toAmericanEnglish("Cancelled"), "Canceled");
  assert.equal(toAmericanEnglish("CANCELLED"), "CANCELED");
  assert.equal(toAmericanEnglish("Enquiry"), "Inquiry");
  assert.equal(toAmericanEnglish("cancelled"), "canceled");
});

test("template placeholders survive untouched", () => {
  // Run before substitution, so the guest's own name and address are never
  // in the string being rewritten.
  const template = "<p>Hi {{guest.first_name}}, your call is cancelled.</p>";
  assert.equal(
    toAmericanEnglish(template),
    "<p>Hi {{guest.first_name}}, your call is canceled.</p>",
  );
  assert.equal(toAmericanEnglish("{{booking.cancel_link}}"), "{{booking.cancel_link}}");
});

test("cancellation keeps its double l, as US English does", () => {
  assert.equal(toAmericanEnglish("cancellation"), "cancellation");
  assert.equal(toAmericanEnglish("Cancellation policy"), "Cancellation policy");
});

test("word choice is not touched — only spelling", () => {
  // Rewriting these would change the writer's voice, not fix a misspelling.
  assert.equal(toAmericanEnglish("Pop the kettle on whilst you wait"), "Pop the kettle on whilst you wait");
  assert.equal(toAmericanEnglish("amongst friends"), "amongst friends");
  assert.equal(toAmericanEnglish("we learnt a lot"), "we learnt a lot");
});

test("a word that merely contains a British spelling is not mangled", () => {
  assert.equal(toAmericanEnglish("greyhound"), "greyhound");
  assert.equal(toAmericanEnglish("centred"), "centred");
});

test("the common travel words are covered", () => {
  assert.equal(toAmericanEnglish("travelling with a traveller"), "traveling with a traveler");
  assert.equal(toAmericanEnglish("enquiries and enquiry"), "inquiries and inquiry");
  assert.equal(toAmericanEnglish("our programme"), "our program");
});
