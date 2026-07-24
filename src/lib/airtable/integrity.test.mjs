import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBirthday,
  parseInstagramUrl,
  parseSafeEmail,
  parseSafeHttpsUrl,
  parseSourceDate,
} from "./integrity.ts";
import {
  buildPersonalDetailsProfile,
  selectPersonalDetails,
} from "./personal-details.ts";

test("external links require credential-free HTTPS URLs", () => {
  assert.equal(parseSafeHttpsUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(parseSafeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(parseSafeHttpsUrl("http://example.com"), null);
  assert.equal(parseSafeHttpsUrl("https://user:secret@example.com"), null);
  assert.equal(parseSafeHttpsUrl(""), undefined);
});

test("host-restricted assets fail closed", () => {
  const hosts = new Set(["v5.airtableusercontent.com"]);
  assert.equal(
    parseSafeHttpsUrl("https://v5.airtableusercontent.com/image.png", hosts),
    "https://v5.airtableusercontent.com/image.png",
  );
  assert.equal(parseSafeHttpsUrl("https://example.com/image.png", hosts), null);
});

test("Instagram handles and URLs stay on Instagram", () => {
  assert.equal(parseInstagramUrl("@cove.travel"), "https://www.instagram.com/cove.travel/");
  assert.equal(parseInstagramUrl("https://instagram.com/cove.travel"), "https://instagram.com/cove.travel");
  assert.equal(parseInstagramUrl("https://example.com/cove.travel"), null);
  assert.equal(parseInstagramUrl("javascript:alert(1)"), null);
});

test("directory contact and calendar fields reject malformed values", () => {
  assert.equal(parseSafeEmail(" Team.Member@Example.com "), "team.member@example.com");
  assert.equal(parseSafeEmail("team\n@example.com"), null);
  assert.equal(parseSourceDate("2026-02-31"), null);
  assert.equal(parseSourceDate("2026-07-15T08:30:00Z"), "2026-07-15");
  assert.equal(parseBirthday("1992-02-29"), "2000-02-29");
});

test("personal details match only one exact verified work email", () => {
  const people = [
    {
      id: "person-1",
      name: "Mira Cove",
      role: "Operations lead",
      team: "Leatherback Travel",
      availability: "Full-time",
      email: "mira@leatherbacktravel.com",
      initials: "MC",
    },
    {
      id: "person-2",
      name: "Alex Cove",
      role: "Trip designer",
      team: "Patch Adventures",
      availability: "Full-time",
      email: "alex@leatherbacktravel.com",
      initials: "AC",
    },
  ];

  assert.deepEqual(
    selectPersonalDetails(people, " MIRA@leatherbacktravel.com "),
    { profile: { ...people[0], sections: [] }, state: "matched" },
  );
  assert.deepEqual(selectPersonalDetails(people, "unknown@leatherbacktravel.com"), {
    state: "not_found",
  });
});

test("duplicate HR emails fail closed instead of selecting a person", () => {
  const duplicate = {
    id: "person-1",
    name: "Mira Cove",
    role: "Operations lead",
    team: "Leatherback Travel",
    availability: "Full-time",
    email: "mira@leatherbacktravel.com",
    initials: "MC",
  };

  assert.deepEqual(
    selectPersonalDetails(
      [duplicate, { ...duplicate, id: "person-2" }],
      duplicate.email,
    ),
    { state: "ambiguous" },
  );
});

test("full Team Members records group address and emergency contact details", () => {
  const person = {
    id: "person-1",
    name: "Mira Cove",
    role: "Operations lead",
    team: "Leatherback Travel",
    availability: "Full-time",
    email: "mira@leatherbacktravel.com",
    initials: "MC",
  };
  const result = buildPersonalDetailsProfile(person, {
    Name: "Mira Cove",
    "Company email": "mira@leatherbacktravel.com",
    Address: "18 Harbour Lane",
    City: "Brighton",
    "Emergency contact name": "Morgan Cove",
    "Emergency contact phone": "+44 7700 900001",
    "Position description": "Operations lead",
  });

  assert.equal(result.integrityIssues, 0);
  assert.deepEqual(
    result.profile.sections.map((section) => [section.kind, section.entries.length]),
    [
      ["personal", 1],
      ["contact", 1],
      ["address", 2],
      ["emergency", 2],
      ["employment", 1],
    ],
  );
});

test("personal details hide linked record IDs and internal HR fields", () => {
  const person = {
    id: "person-1",
    name: "Mira Cove",
    role: "Operations lead",
    team: "Leatherback Travel",
    availability: "Full-time",
    email: "mira@leatherbacktravel.com",
    initials: "MC",
  };
  const result = buildPersonalDetailsProfile(person, {
    "Team record": ["rec1234567890abcd"],
    "Internal HR notes": "Not employee-facing",
    "T-shirt size": "M",
  });

  assert.equal(result.integrityIssues, 1);
  assert.deepEqual(result.profile.sections, [
    {
      kind: "personal",
      title: "Personal information",
      description: "Identity and personal profile",
      entries: [{ label: "T-shirt size", value: "M" }],
    },
  ]);
});

test("confirmed Team Members fields remain visible when Airtable omits blank values", () => {
  const person = {
    id: "person-1",
    name: "Mira Cove",
    role: "Operations lead",
    team: "Leatherback Travel",
    availability: "Full-time",
    email: "mira@leatherbacktravel.com",
    initials: "MC",
  };
  const result = buildPersonalDetailsProfile(
    person,
    { "Emergency Contact Name": "Morgan Cove" },
    ["Address", "Emergency Contact Name", "Emergency Contact Phone Number"],
  );

  assert.deepEqual(result.profile.sections, [
    {
      kind: "address",
      title: "Home address",
      description: "Your address information on file",
      entries: [{ label: "Address", value: undefined }],
    },
    {
      kind: "emergency",
      title: "Emergency contact",
      description: "Who should be contacted in an emergency",
      entries: [
        { label: "Emergency Contact Name", value: "Morgan Cove" },
        { label: "Emergency Contact Phone Number", value: undefined },
      ],
    },
  ]);
});

test("bank name, BSB, and account number stay together in financial details", () => {
  const person = {
    id: "person-1",
    name: "Mira Cove",
    role: "Operations lead",
    team: "Leatherback Travel",
    availability: "Full-time",
    email: "mira@leatherbacktravel.com",
    initials: "MC",
  };
  const result = buildPersonalDetailsProfile(person, {
    "Bank Name": "Example Bank",
    "BSB Number": "000000",
    "Bank Account Number": "12345678",
  });

  assert.deepEqual(result.profile.sections, [
    {
      kind: "financial",
      title: "Pay, tax & super",
      description: "Your payment and statutory details",
      entries: [
        { label: "Bank Name", value: "Example Bank" },
        { label: "BSB Number", value: "000000" },
        { label: "Bank Account Number", value: "12345678" },
      ],
    },
  ]);
});

test("birthday aliases collapse to one employee-facing date of birth field", () => {
  const person = {
    id: "person-1",
    name: "Mira Cove",
    role: "Operations lead",
    team: "Leatherback Travel",
    availability: "Full-time",
    email: "mira@leatherbacktravel.com",
    initials: "MC",
  };
  const result = buildPersonalDetailsProfile(
    person,
    {
      "Date of Birth": "",
      Birthday: "1990-10-12",
      "Birthday Today": "Yes",
    },
    ["Date of Birth"],
  );

  assert.deepEqual(result.profile.sections, [
    {
      kind: "personal",
      title: "Personal information",
      description: "Identity and personal profile",
      entries: [{ label: "Date of Birth", value: "1990-10-12" }],
    },
  ]);
});
