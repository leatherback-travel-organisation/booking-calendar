// Run: node --experimental-strip-types --test src/lib/booking/contact-card.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContactCard, contactCardFileName, escapeVCardText } from "./contact-card.ts";

test("a brand card carries name, numbers, email, website and note", () => {
  const card = buildContactCard({
    name: "Harriet Adventures",
    email: "bookings@harrietadventures.com",
    phones: [
      { label: "main", number: "+1 971 258 0516" },
      { label: "au", number: "+61 482 099 562" },
    ],
    website: "https://harrietadventures.com",
    photoUrl: null,
    note: "Your Booking Manager calls from this number.",
  });
  const lines = card.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCARD");
  assert.equal(lines[1], "VERSION:3.0");
  assert.ok(lines.includes("FN:Harriet Adventures"));
  assert.ok(lines.includes("ORG:Harriet Adventures"));
  assert.ok(lines.includes("TEL;TYPE=WORK,VOICE,PREF:+19712580516"));
  assert.ok(lines.includes("TEL;TYPE=WORK,VOICE:+61482099562"));
  assert.ok(lines.includes("EMAIL;TYPE=INTERNET,WORK:bookings@harrietadventures.com"));
  assert.ok(lines.includes("URL:https://harrietadventures.com"));
  assert.ok(lines.includes("NOTE:Your Booking Manager calls from this number."));
  assert.equal(lines.at(-2), "END:VCARD");
  assert.equal(lines.at(-1), "");
});

test("text values are escaped and blank fields are left out", () => {
  assert.equal(escapeVCardText("a,b;c\\d\nx"), "a\\,b\;c\\\\d\\nx");
  const card = buildContactCard({ name: "Patch, Adventures", email: " ", phones: [{ label: "main", number: "" }], website: null, photoUrl: null, note: null });
  assert.ok(card.includes("FN:Patch\\, Adventures"));
  assert.ok(!card.includes("TEL"));
  assert.ok(!card.includes("EMAIL"));
});

test("long lines fold at 75 octets with a leading space", () => {
  const card = buildContactCard({ name: "X", email: null, phones: [], website: null, photoUrl: null, note: "y".repeat(120) });
  const noteStart = card.indexOf("NOTE:");
  const chunk = card.slice(noteStart).split("\r\n");
  assert.ok(chunk[0].length <= 75);
  assert.ok(chunk[1].startsWith(" "));
});

test("file name is the brand name with a .vcf extension", () => {
  assert.equal(contactCardFileName("Carex Garden Tours"), "Carex Garden Tours.vcf");
  assert.equal(contactCardFileName("***"), "contact.vcf");
});
