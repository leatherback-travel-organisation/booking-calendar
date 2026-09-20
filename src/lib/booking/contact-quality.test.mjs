import assert from "node:assert/strict";
import test from "node:test";
import {
  editDistance,
  emailProblem,
  looksMadeUp,
  nameProblem,
  notesProblem,
  phoneProblem,
  problemField,
  suggestDomain,
} from "./contact-quality.ts";
import { countryForE164, findCountry, isoForGuestCountry, toE164 } from "../../components/booking-public/dial-codes.ts";

const phone = (iso, national) => {
  const e164 = toE164(iso, national);
  return phoneProblem(e164, iso === "XX" ? null : findCountry(iso));
};

// A real guest's address must sail through; the things bots and slips
// produce must not.
test("emailProblem: plain addresses pass", () => {
  assert.equal(emailProblem("jane.doe@gmail.com"), null);
  assert.equal(emailProblem("  Jane+trips@Bigpond.net.au "), null);
  assert.equal(emailProblem("o'neil@example-travel.co.uk"), null);
  assert.equal(emailProblem("someone@mail.com"), null);          // real provider that is one slip from gmail
  assert.equal(emailProblem("someone@gmx.de"), null);
});

test("emailProblem: broken syntax", () => {
  for (const bad of ["jane", "jane@", "@gmail.com", "jane@gmail", "jane@gmail.c", "ja ne@gmail.com", "jane@@gmail.com", ".jane@gmail.com", "ja..ne@gmail.com"]) {
    assert.equal(emailProblem(bad)?.code, "email_syntax", bad);
  }
});

test("emailProblem: throwaway inboxes are refused", () => {
  assert.equal(emailProblem("x@mailinator.com")?.code, "email_disposable");
  assert.equal(emailProblem("x@sub.yopmail.com")?.code, "email_disposable");
  assert.equal(emailProblem("x@example.com")?.code, "email_disposable");
});

test("emailProblem: near-miss domains are suggested, not refused", () => {
  const p = emailProblem("jane@gmial.com");
  assert.equal(p?.code, "email_typo");
  assert.equal(p?.suggestion, "jane@gmail.com");
  assert.equal(emailProblem("jane@hotmail.con")?.suggestion, "jane@hotmail.com");
  assert.equal(emailProblem("jane@outlok.com")?.suggestion, "jane@outlook.com");
  assert.equal(emailProblem("jane@yahoo.com.ua")?.suggestion, "jane@yahoo.com.au");
});

test("suggestDomain leaves unrelated domains alone", () => {
  assert.equal(suggestDomain("leatherbacktravel.com"), null);
  assert.equal(suggestDomain("gmail.com"), null);
  assert.equal(suggestDomain("mail.com"), null);
  assert.equal(editDistance("gmial", "gmail"), 1);
  assert.equal(editDistance("kitten", "sitting"), 3);
});

// Phone numbers arrive as E.164 from the form; the checks work on the
// national part behind the dial code.
test("phoneProblem: real shapes pass", () => {
  assert.equal(phone("AU", "0421 987 654"), null);
  assert.equal(phoneProblem("+61421987654", countryForE164("+61421987654")), null);                 // iso inferred
  assert.equal(phone("US", "(415) 555-2671"), null);
  assert.equal(phone("GB", "07700 912345"), null);
  assert.equal(phone("GB", "020 7946 0958"), null);
  assert.equal(phoneProblem("+381641234567", null), null);          // Serbia via "Other": only E.164 checks
  assert.equal(phone("DE", "0171 5556789"), null);
});

test("phoneProblem: wrong lengths", () => {
  assert.equal(phone("AU", "0412 345")?.code, "phone_short");
  assert.equal(phone("US", "415 555 26")?.code, "phone_short");
  assert.equal(phone("US", "415 555 26712345")?.code, "phone_long");
  assert.equal(phoneProblem("+1234", null)?.code, "phone_syntax");
  assert.equal(phoneProblem("+999123456789012345", null)?.code, "phone_syntax");
  assert.match(phone("AU", "0412 345").message, /Australia/);
});

test("phoneProblem: made-up numbers", () => {
  assert.equal(phone("AU", "0400 000 000")?.code, "phone_pattern");
  assert.equal(phone("US", "1234567890")?.code, "phone_pattern");
  assert.equal(phone("US", "1111111111")?.code, "phone_pattern");
  assert.equal(phone("GB", "1212121212")?.code, "phone_pattern");
  assert.equal(looksMadeUp("412345678"), false);            // partial run, a real number shape
  assert.equal(looksMadeUp("123456789"), true);
  assert.equal(looksMadeUp("98765432"), true);
});

test("phoneProblem: the placeholder example is not a phone number", () => {
  assert.equal(phone("AU", "412 345 678")?.code, "phone_example");
  assert.equal(phone("US", "201 555 0123")?.code, "phone_example");
  assert.equal(phoneProblem("+971501234567", null)?.code, "phone_example");
});

test("countryForE164 picks the longest matching dial code", () => {
  assert.equal(countryForE164("+61412345678")?.iso, "AU");
  assert.equal(countryForE164("+35385012345")?.iso, "IE");       // 353 beats 35 (none) — and not 3
  assert.equal(countryForE164("+85251234567")?.iso, "HK");
  assert.equal(countryForE164("+381641234567"), null);
});

// The edge header presets the dial code. A listed country wins; a real
// country we don't list means "Other" — not a silent Australia.
test("isoForGuestCountry", () => {
  assert.equal(isoForGuestCountry("US", "en-AU"), "US");
  assert.equal(isoForGuestCountry("RS", "en-AU"), "XX");
  assert.equal(isoForGuestCountry(null, "en-GB"), "GB");
  assert.equal(isoForGuestCountry(null, "fr"), "AU");
  assert.equal(isoForGuestCountry("XX", "en-NZ"), "NZ");         // Vercel's unknown marker
  assert.equal(isoForGuestCountry("T1", "en-NZ"), "NZ");         // Tor marker
});

test("nameProblem and notesProblem catch link spam only", () => {
  assert.equal(nameProblem("Nicola Noviello"), null);
  assert.equal(nameProblem("Mary-Jane O'Connor"), null);
  assert.equal(nameProblem("Buy now https://spam.example")?.code, "name_link");
  assert.equal(nameProblem("bestdeals.xyz")?.code, "name_link");
  assert.equal(nameProblem("<b>bot</b>")?.code, "name_link");
  assert.equal(notesProblem("Keen on Morocco in May, see https://harrietadventures.com/tour/morocco-adventure/"), null);
  assert.equal(notesProblem("http://a.example http://b.example http://c.example")?.code, "notes_spam");
});

test("problemField maps codes to fields", () => {
  assert.equal(problemField("email_unreachable"), "email");
  assert.equal(problemField("phone_short"), "phone");
  assert.equal(problemField("name_link"), "name");
  assert.equal(problemField("slot_taken"), null);
});
