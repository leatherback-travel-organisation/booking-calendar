import assert from "node:assert/strict";
import test from "node:test";
import { escapeIcsText, foldIcsLine, icsCancel, icsRequest } from "./ics.ts";
import { extractVariables, htmlToText, renderBrandEmail, renderTemplate, UnknownVariableError, validateTemplate } from "./render.ts";
import { allVariableNames, isKnownVariable, sampleValues } from "./variables.ts";
import { hashToken, issueToken, tokenMatches } from "../tokens.ts";

// --- tokens ---------------------------------------------------------------

test("issued tokens verify against their stored hash and only that hash", () => {
  const token = issueToken();
  assert.equal(tokenMatches(token.raw, token.hash), true);
  assert.equal(tokenMatches(token.raw, issueToken().hash), false);
  assert.equal(tokenMatches("short", token.hash), false);
  assert.equal(tokenMatches("", token.hash), false);
  assert.equal(token.raw.length >= 42, true); // 32 bytes base64url
  assert.deepEqual(hashToken(token.raw), token.hash);
});

// --- ics ------------------------------------------------------------------

const ICS_EVENT = {
  uid: "booking-3c1a@cove.leatherbacktravel.com",
  sequence: 0,
  startIso: "2026-08-18T04:30:00Z",
  endIso: "2026-08-18T05:00:00Z",
  summary: "Lead-Up Call — Patch Adventures",
  organizerName: "Claire Jakobi",
  organizerEmail: "claire@patchadventures.com.au",
  attendeeName: "Susan Whitfield",
  attendeeEmail: "susan@example.com",
  description: "Your call with Claire; bring questions, and a cuppa.",
  url: "https://meet.google.com/abc-defg-hij",
};

test("METHOD:REQUEST ics carries UTC times, UID, organizer and attendee", () => {
  const folded = icsRequest(ICS_EVENT);
  assert.ok(/\r\n$/.test(folded), "CRLF line endings");
  const ics = folded.replace(/\r\n /g, ""); // unfold before content assertions
  assert.ok(ics.includes("METHOD:REQUEST"));
  assert.ok(ics.includes("UID:booking-3c1a@cove.leatherbacktravel.com"));
  assert.ok(ics.includes("DTSTART:20260818T043000Z"));
  assert.ok(ics.includes("DTEND:20260818T050000Z"));
  assert.ok(ics.includes("STATUS:CONFIRMED"));
  assert.ok(ics.includes("SEQUENCE:0"));
  assert.ok(ics.includes("mailto:susan@example.com"));
});

test("METHOD:CANCEL reuses the same UID with a bumped sequence so calendars remove the event", () => {
  const ics = icsCancel({ ...ICS_EVENT, sequence: 1 });
  assert.ok(ics.includes("METHOD:CANCEL"));
  assert.ok(ics.includes("STATUS:CANCELLED"));
  assert.ok(ics.includes("SEQUENCE:1"));
  assert.ok(ics.includes("UID:booking-3c1a@cove.leatherbacktravel.com"));
});

test("ics text escaping and 75-octet folding are RFC 5545 compliant", () => {
  assert.equal(escapeIcsText("a,b;c\nd\\e"), "a\\,b\\;c\\nd\\\\e");
  const folded = foldIcsLine("X:" + "é".repeat(60));
  for (const line of folded.split("\r\n")) {
    assert.ok(Buffer.from(line, "utf8").length <= 76, "folded lines fit");
  }
  // No UTF-8 sequence was split.
  assert.equal(folded.replace(/\r\n /g, ""), "X:" + "é".repeat(60));
});

// --- variables + rendering ------------------------------------------------

test("registry names are well-formed and lookups agree with the list", () => {
  const names = allVariableNames();
  assert.ok(names.includes("guest.first_name"));
  assert.ok(names.includes("booking.reschedule_link"));
  for (const name of names) assert.equal(isKnownVariable(name), true);
  assert.equal(isKnownVariable("guest.first_nmae"), false);
  assert.equal(isKnownVariable("nonsense"), false);
});

test("unknown variables are a build error, not an empty string", () => {
  assert.throws(() => validateTemplate("Hi {{guest.first_nmae}},"), UnknownVariableError);
  assert.throws(() => renderTemplate("Hi {{guest.first_nmae}},", {}), UnknownVariableError);
  try {
    validateTemplate("Hi {{guest.first_nmae}} and {{trip.nope}}");
    assert.fail("should throw");
  } catch (error) {
    assert.deepEqual(error.variables, ["guest.first_nmae", "trip.nope"]);
  }
});

test("a known variable with no value supplied refuses to render", () => {
  assert.throws(() => renderTemplate("Hi {{guest.first_name}}", {}), UnknownVariableError);
});

test("rendering with sample values reads as a real sentence", () => {
  const rendered = renderTemplate(
    "You're booked for a call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}}.",
    sampleValues(),
  );
  assert.equal(rendered, "You're booked for a call with Lisa on Tuesday 18 August at 2:30pm.");
});

test("extractVariables sees every reference including whitespace variants", () => {
  assert.deepEqual(
    extractVariables("{{guest.first_name}} {{ booking.meeting_time }} {{guest.first_name}}"),
    ["guest.first_name", "booking.meeting_time"],
  );
});

test("brand shell wraps the body with the brand's own identity", () => {
  const html = renderBrandEmail(
    { brandName: "Camino Women", logoUrl: null, colorPrimary: "#7a2048", supportPhone: "1300 111 222", fromName: "Camino Women" },
    "<p>Hi Susan</p>",
  );
  assert.ok(html.includes("Camino Women"));
  assert.ok(html.includes("#7a2048"));
  assert.ok(html.includes("1300 111 222"));
  assert.ok(html.includes("<p>Hi Susan</p>"));
});

test("plain-text alternative strips markup sensibly", () => {
  assert.equal(
    htmlToText("<p>Hi <strong>Susan</strong></p><ul><li>One</li><li>Two &amp; three</li></ul>"),
    "Hi Susan\n- One\n- Two & three",
  );
});
