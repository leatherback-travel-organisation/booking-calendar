import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBrandColours,
  pickBrandLogo,
  addDays,
  brandIdsForNames,
  buildApprovedLeave,
  buildDepartureIndex,
  computeCoverageIssues,
  computeLeaveCalendarBlockIssues,
  departureLookupKey,
  isUpcomingDeparture,
  normalizeBookingManagers,
  normalizeEmail,
  staffSlug,
} from "./normalize.ts";

const TODAY = "2026-08-17";

const brand = (key, name, aliases) => ({ id: `id-${key}`, key, name, aliases, active: true });

const BRANDS = [
  brand("patch", "Patch Adventures", ["Patch Adventures"]),
  brand("camino-women", "Camino Women", ["Camino Women"]),
  brand("magnificent-explorers", "Magnificent Explorers", ["Magnificent Explorers", "Magnificent Rail"]),
  brand("fencox", "Fencox", ["Fencox Travel"]),
  brand("carex", "Carex", ["Carex Tours"]),
  brand("salt-caravan", "Salt Caravan", ["Salt Caravan"]),
  brand("harriet", "Harriet Adventures", ["Harriet Adventures"]),
];

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Farrah@PatchAdventures.COM.au \n"), "farrah@patchadventures.com.au");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(normalizeEmail("   "), "");
});

// ---------------------------------------------------------------------------
// brandIdsForNames
// ---------------------------------------------------------------------------

test("brandIdsForNames matches aliases, keys and names", () => {
  assert.deepEqual(brandIdsForNames(["Fencox Travel"], BRANDS).ids, ["id-fencox"]);
  assert.deepEqual(brandIdsForNames(["Fencox"], BRANDS).ids, ["id-fencox"]);
  assert.deepEqual(brandIdsForNames(["Magnificent Rail"], BRANDS).ids, ["id-magnificent-explorers"]);
  assert.deepEqual(brandIdsForNames(["Carex Tours"], BRANDS).ids, ["id-carex"]);
  assert.deepEqual(brandIdsForNames(["Carex"], BRANDS).ids, ["id-carex"]);
  assert.deepEqual(brandIdsForNames(["Camino Women"], BRANDS).ids, ["id-camino-women"]);
});

test("brandIdsForNames reports unknown names instead of dropping them", () => {
  const result = brandIdsForNames(["Salemi", "SFSF", "Leatherback Travel", "Patch Adventures"], BRANDS);
  assert.deepEqual(result.ids, ["id-patch"]);
  assert.deepEqual(result.unmatched, ["Salemi", "SFSF", "Leatherback Travel"]);
});

test("brandIdsForNames de-duplicates alias + name hits", () => {
  const result = brandIdsForNames(["Carex", "Carex Tours"], BRANDS);
  assert.deepEqual(result.ids, ["id-carex"]);
  assert.deepEqual(result.unmatched, []);
});

// ---------------------------------------------------------------------------
// buildDepartureIndex
// ---------------------------------------------------------------------------

const trip = (id, fields) => ({ id, fields });

test("buildDepartureIndex parses URLs, strips www, and keeps coordinators", () => {
  const records = [
    trip("recLater", {
      "Trip Title & Code": "Morocco 15 Days - MOR2",
      "Trip Name": ["Morocco 15 Days"],
      "AUT: Nice Name": ["Morocco"],
      "Trip Coordinator": ["bm1", "bm2"],
      "Start Date": ["2026-11-02"],
      Status: ["Published"],
      Brand: ["Patch Adventures"],
      "Website URL": [" https://www.patchadventures.com.au/tour/fifteen-day-morocco-adventure/ "],
    }),
    trip("recSooner", {
      "Trip Title & Code": "Morocco 15 Days - MOR1",
      "Trip Coordinator": ["bm1"],
      "Start Date": ["2026-09-14T00:00:00.000Z"],
      Status: ["Published"],
      Brand: ["Patch Adventures"],
      "Website URL": ["patchadventures.com.au/tour/fifteen-day-morocco-adventure"],
    }),
    trip("recBadUrl", {
      "Trip Title & Code": "Mystery Trip",
      "Trip Coordinator": [],
      "Start Date": ["2026-10-01"],
      Status: ["Published"],
      Brand: ["Magnificent Rail"],
      "Website URL": ["not a url at all %%%"],
    }),
    trip("recNoUrl", {
      "Trip Title & Code": "No URL Trip",
      "Start Date": ["2026-10-05"],
      Status: ["Published"],
      Brand: ["Salemi"],
    }),
  ];

  const index = buildDepartureIndex(records, BRANDS);
  assert.equal(index.departures.length, 4);

  const later = index.departures.find((d) => d.airtableId === "recLater");
  assert.equal(later.host, "patchadventures.com.au");
  assert.equal(later.slug, "fifteen-day-morocco-adventure");
  assert.equal(later.startDate, "2026-11-02");
  assert.deepEqual(later.coordinatorAirtableIds, ["bm1", "bm2"]);
  assert.equal(later.tripName, "Morocco 15 Days");
  assert.equal(later.niceName, "Morocco");

  const sooner = index.departures.find((d) => d.airtableId === "recSooner");
  assert.equal(sooner.startDate, "2026-09-14");

  const bad = index.departures.find((d) => d.airtableId === "recBadUrl");
  assert.equal(bad.host, null);
  assert.equal(bad.slug, null);

  // Lookup buckets are sorted by start date, and www/host variants collide
  // onto the same key.
  const bucket = index.bySlug.get(departureLookupKey("patchadventures.com.au", "fifteen-day-morocco-adventure"));
  assert.deepEqual(
    bucket.map((d) => d.airtableId),
    ["recSooner", "recLater"],
  );
  const hostless = index.bySlug.get(departureLookupKey(null, "fifteen-day-morocco-adventure"));
  assert.equal(hostless.length, 2);

  // Brand resolution is alias-aware; unknown brands map to null.
  assert.equal(index.brandIdByAirtableId.get("recLater"), "id-patch");
  assert.equal(index.brandIdByAirtableId.get("recBadUrl"), "id-magnificent-explorers");
  assert.equal(index.brandIdByAirtableId.get("recNoUrl"), null);
});

test("isUpcomingDeparture needs a future date and an actionable status", () => {
  const index = buildDepartureIndex(
    [
      trip("a", { "Trip Title & Code": "A", "Start Date": ["2026-09-01"], Status: ["Published"] }),
      trip("b", { "Trip Title & Code": "B", "Start Date": ["2026-01-01"], Status: ["Published"] }),
      trip("c", { "Trip Title & Code": "C", "Start Date": ["2026-09-01"], Status: ["Cancelled"] }),
      trip("d", { "Trip Title & Code": "D", "Start Date": ["2026-09-01"], Status: ["Marketing Ready"] }),
    ],
    BRANDS,
  );
  const byId = new Map(index.departures.map((d) => [d.airtableId, d]));
  assert.equal(isUpcomingDeparture(byId.get("a"), TODAY), true);
  assert.equal(isUpcomingDeparture(byId.get("b"), TODAY), false);
  assert.equal(isUpcomingDeparture(byId.get("c"), TODAY), false);
  assert.equal(isUpcomingDeparture(byId.get("d"), TODAY), true);
});

// ---------------------------------------------------------------------------
// staffSlug
// ---------------------------------------------------------------------------

test("staffSlug kebabs first + last name and de-dupes with -2 suffixes", () => {
  const taken = new Set();
  assert.equal(staffSlug("Farrah Jones", taken), "farrah-jones");
  assert.equal(staffSlug("Farrah  Jones ", taken), "farrah-jones-2");
  assert.equal(staffSlug("Farrah Jones", taken), "farrah-jones-3");
  assert.equal(staffSlug("Mary Anne O'Neil", taken), "mary-oneil");
  assert.equal(staffSlug("Cher", taken), "cher");
  assert.ok(taken.has("farrah-jones-3"));
});

// ---------------------------------------------------------------------------
// normalizeBookingManagers
// ---------------------------------------------------------------------------

test("normalizeBookingManagers trims multiline names and casts ids to text", () => {
  const [manager] = normalizeBookingManagers([
    {
      id: "bm1",
      fields: {
        Name: "Farrah\nJones\n",
        Email: " Farrah@PatchAdventures.com.au ",
        "Help Scout User ID": 123456,
        "AirCall User ID": 789,
        "Slack User ID": "U0AAA",
      },
    },
  ]);
  assert.equal(manager.name, "Farrah Jones");
  assert.equal(manager.email, "farrah@patchadventures.com.au");
  assert.equal(manager.helpscoutUserId, "123456");
  assert.equal(manager.aircallUserId, "789");
  assert.equal(manager.slackUserId, "U0AAA");
});

// ---------------------------------------------------------------------------
// buildApprovedLeave
// ---------------------------------------------------------------------------

test("buildApprovedLeave joins by record link and flags unjoinable rows", () => {
  const team = [
    { id: "tm1", fields: { Name: "Cara Soto", "Company email": "cara@caminowomen.com.au", Status: "Current" } },
    { id: "tm2", fields: { Name: "No Mail", Status: "Current" } },
  ];
  const leave = [
    { id: "lv1", fields: { "Team Member": ["tm1"], "Start date": "2026-09-01", "End date": "2026-09-05", Status: "Approved" } },
    { id: "lv2", fields: { "Team Member": ["tm1"], "Start date": "2026-09-10", "End date": "2026-09-11", Status: "Pending" } },
    { id: "lv3", fields: { "Team Member": ["tm2"], "Start date": "2026-09-01", "End date": "2026-09-02", Status: "Approved by manager" } },
    { id: "lv4", fields: { "Team Member": ["tmMissing"], "Start date": "2026-09-01", "End date": "2026-09-02", Status: "approved" } },
  ];
  const result = buildApprovedLeave(leave, team, TODAY);
  assert.deepEqual(result.rows, [
    { email: "cara@caminowomen.com.au", startDate: "2026-09-01", endDate: "2026-09-05", raw: "Approved" },
  ]);
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.every((issue) => issue.kind === "leave-unjoined"));
  assert.deepEqual(result.issues.map((issue) => issue.subjectRef).sort(), ["lv3", "lv4"]);
});

// ---------------------------------------------------------------------------
// computeCoverageIssues — fixture exercising every kind
// ---------------------------------------------------------------------------

function fixture() {
  const trips = [
    // Upcoming, Published, no coordinator → departure-no-coordinator.
    trip("recA", {
      "Trip Title & Code": "Morocco 15 Days - MOR1",
      "Trip Coordinator": [],
      "Start Date": ["2026-09-01"],
      Status: ["Published"],
      Brand: ["Patch Adventures"],
      "Website URL": ["https://patchadventures.com.au/tour/fifteen-day-morocco-adventure/"],
    }),
    // Coordinators resolve to a BM without email + an email unknown to staff.
    trip("recB", {
      "Trip Title & Code": "Camino Frances - CAM1",
      "Trip Coordinator": ["bmNoEmail", "bmGhost"],
      "Start Date": ["2026-09-10"],
      Status: ["Marketing Ready"],
      Brand: ["Camino Women"],
      "Website URL": ["https://caminowomen.com.au/tour/camino-frances/"],
    }),
    // Upcoming with empty URL → departure-bad-url; fencox has one BM.
    trip("recC", {
      "Trip Title & Code": "Peru Explorer - PER1",
      "Trip Coordinator": ["bmGood"],
      "Start Date": ["2026-10-01"],
      Status: ["Published"],
      Brand: ["Fencox Travel"],
    }),
    // Unknown brand → brand-unmapped (and a bad URL too).
    trip("recD", {
      "Trip Title & Code": "Sicily Slow Food - SIC1",
      "Trip Coordinator": ["bmGood"],
      "Start Date": ["2026-09-05"],
      Status: ["Published"],
      Brand: ["Salemi Tours"],
      "Website URL": ["not a url at all %%%"],
    }),
    // Harriet has upcoming departures and no staff → brand-no-bm.
    trip("recE", {
      "Trip Title & Code": "Iceland Circle - ICE1",
      "Trip Coordinator": ["bmGood"],
      "Start Date": ["2026-09-20"],
      Status: ["Published"],
      Brand: ["Harriet Adventures"],
      "Website URL": ["https://harrietadventures.com/tour/iceland-circle/"],
    }),
    // Operational test fixture ("Ceco" in the title) → never flagged, even
    // with an unknown coordinator and no URL.
    trip("recCeco", {
      "Trip Title & Code": "Via Cecos Land XX Days 2030 TEESST",
      "Trip Coordinator": ["bmGhost"],
      "Start Date": ["2026-09-15"],
      Status: ["Published"],
      Brand: ["Fencox Travel"],
    }),
    // "Private Trip" departures are sold outside the public funnel → same
    // exemption.
    trip("recPrivate", {
      "Trip Title & Code": "Private Trip Andes Crossing SMITH",
      "Trip Coordinator": ["bmGhost"],
      "Start Date": ["2026-09-16"],
      Status: ["Published"],
      Brand: ["Fencox Travel"],
      "Website URL": ["www.na"],
    }),
    // Past departure and cancelled departure → never flagged.
    trip("recPast", {
      "Trip Title & Code": "Old Trip - OLD1",
      "Trip Coordinator": [],
      "Start Date": ["2026-01-01"],
      Status: ["Published"],
      Brand: ["Patch Adventures"],
      "Website URL": ["https://patchadventures.com.au/tour/old-trip/"],
    }),
    trip("recCancelled", {
      "Trip Title & Code": "Cancelled Trip - CAN1",
      "Trip Coordinator": [],
      "Start Date": ["2026-09-25"],
      Status: ["Cancelled"],
      Brand: ["Patch Adventures"],
      "Website URL": ["https://patchadventures.com.au/tour/cancelled-trip/"],
    }),
  ];

  const airtableManagers = normalizeBookingManagers([
    { id: "bmNoEmail", fields: { Name: "No Email\n" } },
    { id: "bmGhost", fields: { Name: "Ghost BM", Email: "ghost@leatherbacktravel.com" } },
    { id: "bmGood", fields: { Name: "Alice Good", Email: "alice@patchadventures.com.au", "Help Scout User ID": 42 } },
    { id: "bmFarrah", fields: { Name: "Farrah Jones", Email: "farrah@patchadventures.com.au" } },
  ]);

  const notionStaff = [
    {
      notionPageId: "notion-farrah",
      name: "Farrah Jones",
      // Real mismatch shape: .com in Notion vs .com.au in Airtable.
      email: "farrah@patchadventures.com",
      jobTitle: "Booking Manager",
      brands: ["Patch Adventures"],
      location: "Sydney",
      phone: null,
      slackId: null,
      photoUrl: null,
      lastEdited: "2026-08-01T00:00:00.000Z",
    },
    {
      notionPageId: "notion-alice",
      name: "Alice Good",
      email: "alice@patchadventures.com.au",
      jobTitle: "Booking Manager",
      brands: ["Patch Adventures"],
      location: "Sydney",
      phone: null,
      slackId: null,
      photoUrl: null,
      lastEdited: "2026-08-01T00:00:00.000Z",
    },
    {
      // Brand maps to nothing → staff-brand-unmapped.
      notionPageId: "notion-lea",
      name: "Lea HQ",
      email: "alice@patchadventures.com.au",
      jobTitle: "Booking Manager",
      brands: ["Leatherback Travel"],
      location: "Remote",
      phone: null,
      slackId: null,
      photoUrl: null,
      lastEdited: "2026-08-01T00:00:00.000Z",
    },
  ];

  const staffRow = (id, email, fullName, brandKeys, overrides = {}) => ({
    id,
    email,
    fullName,
    active: true,
    calendarOk: true,
    calendarCheckedAt: "2026-08-10T00:00:00.000Z",
    brandIds: brandKeys.map((key) => `id-${key}`),
    notionPageId: null,
    ...overrides,
  });

  const staff = [
    staffRow("s1", "alice@patchadventures.com.au", "Alice Good", ["patch"]),
    // Calendar unreachable (checked, not ok).
    staffRow("s2", "bob@patchadventures.com.au", "Bob Reed", ["patch"], { calendarOk: false }),
    // Never checked → info, not error.
    staffRow("s3", "cara@caminowomen.com.au", "Cara Soto", ["camino-women"], {
      calendarOk: false,
      calendarCheckedAt: null,
    }),
    staffRow("s4", "dana@caminowomen.com.au", "Dana Wu", ["camino-women"]),
    // Fencox single BM.
    staffRow("s5", "erin@fencox.com", "Erin Vale", ["fencox"]),
    // Salt Caravan single BM but no upcoming departures → not flagged.
    staffRow("s6", "sam@saltcaravan.com", "Sam Hill", ["salt-caravan"]),
    // Inactive staff never counts toward pools or calendar checks.
    staffRow("s7", "old@patchadventures.com.au", "Old Timer", ["harriet"], { active: false, calendarOk: false }),
  ];

  const approvedLeave = [
    { email: "cara@caminowomen.com.au", startDate: "2026-09-01", endDate: "2026-09-05", raw: "Approved" },
    { email: "dana@caminowomen.com.au", startDate: "2026-09-03", endDate: "2026-09-08", raw: "Approved" },
    // Solo leave elsewhere — no reduced cover.
    { email: "erin@fencox.com", startDate: "2026-09-01", endDate: "2026-09-02", raw: "Approved" },
  ];

  const departures = buildDepartureIndex(trips, BRANDS).departures;
  return { today: TODAY, departures, airtableManagers, notionStaff, staff, brands: BRANDS, approvedLeave };
}

function findAll(issues, kind) {
  return issues.filter((issue) => issue.kind === kind);
}

test("computeCoverageIssues exercises every kind", () => {
  const issues = computeCoverageIssues(fixture());

  // departure-no-coordinator: only the upcoming, actionable departure.
  const noCoordinator = findAll(issues, "departure-no-coordinator");
  assert.deepEqual(noCoordinator.map((issue) => issue.subjectRef), ["recA"]);
  assert.equal(noCoordinator[0].severity, "error");
  assert.equal(noCoordinator[0].detail.url, "https://patchadventures.com.au/tour/fifteen-day-morocco-adventure/");

  // coordinator-unknown: no-email BM and unknown-email BM, keyed per pair.
  const unknown = findAll(issues, "coordinator-unknown");
  assert.deepEqual(
    unknown.map((issue) => issue.subjectRef).sort(),
    ["recB:bmGhost", "recB:bmNoEmail"],
  );
  assert.ok(unknown.every((issue) => issue.severity === "error"));

  // Call-routing-exempt trips (Ceco fixtures, Private Trips) never surface.
  assert.ok(issues.every((issue) => !String(issue.subjectRef).includes("recCeco")));
  assert.ok(issues.every((issue) => !String(issue.subjectRef).includes("recPrivate")));

  // staff-calendar-unreachable vs calendar-never-checked.
  assert.deepEqual(
    findAll(issues, "staff-calendar-unreachable").map((issue) => issue.subjectRef),
    ["bob@patchadventures.com.au"],
  );
  assert.deepEqual(
    findAll(issues, "calendar-never-checked").map((issue) => issue.subjectRef),
    ["cara@caminowomen.com.au"],
  );
  assert.equal(findAll(issues, "calendar-never-checked")[0].severity, "info");

  // brand-single-bm only for brands with upcoming departures.
  const singleBm = findAll(issues, "brand-single-bm");
  assert.deepEqual(singleBm.map((issue) => issue.subjectRef), ["fencox"]);
  assert.match(singleBm[0].message, /no backup is possible/);

  // brand-no-bm for harriet (upcoming departure, empty pool).
  const noBm = findAll(issues, "brand-no-bm");
  assert.deepEqual(noBm.map((issue) => issue.subjectRef), ["harriet"]);
  assert.equal(noBm[0].severity, "error");

  // notion-airtable-email-mismatch: Farrah's .com vs .com.au.
  const mismatch = findAll(issues, "notion-airtable-email-mismatch");
  assert.deepEqual(mismatch.map((issue) => issue.subjectRef), ["farrah@patchadventures.com"]);

  // departure-bad-url: missing URL + garbage URL.
  assert.deepEqual(
    findAll(issues, "departure-bad-url").map((issue) => issue.subjectRef).sort(),
    ["recC", "recD"],
  );

  // brand-unmapped: grouped per unknown brand name.
  const unmapped = findAll(issues, "brand-unmapped");
  assert.deepEqual(unmapped.map((issue) => issue.subjectRef), ["salemi-tours"]);
  assert.equal(unmapped[0].detail.count, 1);

  // staff-brand-unmapped: Lea's Leatherback-only mapping.
  const staffUnmapped = findAll(issues, "staff-brand-unmapped");
  assert.deepEqual(staffUnmapped.map((issue) => issue.subjectRef), ["notion-lea"]);
  assert.equal(staffUnmapped[0].severity, "info");

  // leave-reduced-cover: Cara + Dana overlap 2026-09-03 → 2026-09-05.
  const reduced = findAll(issues, "leave-reduced-cover");
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].subjectRef, "camino-women:2026-09-03");
  assert.match(reduced[0].message, /Camino Women/);
  assert.match(reduced[0].message, /2 Booking Managers/);
  assert.match(reduced[0].message, /2026-09-03 → 2026-09-05/);
  assert.deepEqual(reduced[0].detail.staff.sort(), ["cara@caminowomen.com.au", "dana@caminowomen.com.au"]);

  // Negatives: quiet things stay quiet.
  const refs = new Set(issues.map((issue) => `${issue.kind}::${issue.subjectRef}`));
  assert.ok(!refs.has("departure-no-coordinator::recPast"));
  assert.ok(!refs.has("departure-no-coordinator::recCancelled"));
  assert.ok(!refs.has("brand-single-bm::salt-caravan"));
  assert.ok(!refs.has("notion-airtable-email-mismatch::alice@patchadventures.com.au"));
  assert.ok(!refs.has("staff-calendar-unreachable::old@patchadventures.com.au"));
});

test("computeCoverageIssues subject refs are stable across runs", () => {
  const first = computeCoverageIssues(fixture());
  const second = computeCoverageIssues(fixture());
  assert.deepEqual(
    first.map((issue) => `${issue.kind}::${issue.subjectRef}`),
    second.map((issue) => `${issue.kind}::${issue.subjectRef}`),
  );
});

// ---------------------------------------------------------------------------
// leave-no-calendar-block (designed now, wired in Phase 3)
// ---------------------------------------------------------------------------

test("computeLeaveCalendarBlockIssues flags leave days without busy time", () => {
  const approvedLeave = [
    { email: "erin@fencox.com", startDate: "2026-08-20", endDate: "2026-08-21", raw: "Approved" },
    { email: "sam@saltcaravan.com", startDate: "2026-08-20", endDate: "2026-08-20", raw: "Approved" },
    { email: "nofetch@fencox.com", startDate: "2026-08-20", endDate: "2026-08-21", raw: "Approved" },
    // Entirely in the past → ignored.
    { email: "erin@fencox.com", startDate: "2026-01-05", endDate: "2026-01-06", raw: "Approved" },
  ];
  const busyByEmail = new Map([
    // Covers only the first day of leave.
    ["erin@fencox.com", [{ start: "2026-08-20T00:00:00Z", end: "2026-08-21T00:00:00Z" }]],
    // Fully covered by an overlapping busy block.
    ["sam@saltcaravan.com", [{ start: "2026-08-19T22:00:00Z", end: "2026-08-21T02:00:00Z" }]],
    // nofetch@ intentionally absent: unfetched calendar is not empty calendar.
  ]);

  const issues = computeLeaveCalendarBlockIssues({ today: TODAY, approvedLeave, busyByEmail });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "leave-no-calendar-block");
  assert.equal(issues[0].severity, "error");
  assert.equal(issues[0].subjectRef, "erin@fencox.com:2026-08-20");
  assert.deepEqual(issues[0].detail.missingDays, ["2026-08-21"]);
});

test("computeLeaveCalendarBlockIssues only checks days from today forward", () => {
  const issues = computeLeaveCalendarBlockIssues({
    today: "2026-08-21",
    approvedLeave: [{ email: "erin@fencox.com", startDate: "2026-08-19", endDate: "2026-08-21", raw: "Approved" }],
    busyByEmail: new Map([["erin@fencox.com", [{ start: "2026-08-21T00:00:00Z", end: "2026-08-22T00:00:00Z" }]]]),
  });
  // Days before today are not inspected; the remaining day is covered.
  assert.equal(issues.length, 0);
});

// ---------------------------------------------------------------------------
// misc helpers
// ---------------------------------------------------------------------------

test("addDays crosses month boundaries in UTC", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-09-01", -1), "2026-08-31");
});

test("buildDepartureIndex carries Countries and Regions Visited for trip search", () => {
  const index = buildDepartureIndex(
    [
      trip("recNepal", {
        "Trip Title & Code": "Annapurna Base Camp 14 Days - ABC1",
        "Trip Name": ["Annapurna Base Camp 14 Days"],
        "Start Date": ["2026-10-05"],
        Status: ["Published"],
        Brand: ["Patch Adventures"],
        "Website URL": ["patchadventures.com.au/tour/annapurna-base-camp"],
        "Countries Visited": ["Nepal"],
        "Regions Visited": ["Central & South Asia"],
      }),
      trip("recNoLookups", {
        "Trip Title & Code": "Mystery",
        Status: ["Published"],
        Brand: ["Patch Adventures"],
      }),
    ],
    [{ key: "patch", name: "Patch Adventures", aliases: [] }],
  );
  assert.deepEqual(index.departures[0].countries, ["Nepal"]);
  assert.deepEqual(index.departures[0].regions, ["Central & South Asia"]);
  // Absent lookups normalise to empty arrays, never undefined.
  assert.deepEqual(index.departures[1].countries, []);
  assert.deepEqual(index.departures[1].regions, []);
});

test("brand palette parsing prefers the documented button colour and real logos", () => {
  // Harriet documents roles: Amber owns "Buttons and the CTA band"; Parchment
  // is first but is a background. "Secondary button border" must not win.
  const harriet = parseBrandColours(
    "Parchment\n#E4D9C0\nDefault page background\n\nRoasted Cacao\n#332E29\nBody text. Secondary button border\n\nAmber\n#D38E35\nButtons and the CTA band\n\nMisty Harbour\n#748CA2\nFills and secondary buttons only",
  );
  assert.deepEqual(harriet, { primary: "#d38e35", accent: "#e4d9c0" });

  // Plain lists: first hex is primary, next distinct hex is accent.
  assert.deepEqual(parseBrandColours("#5d224d (Eggplant)\n#60cb99 (Mint)"), { primary: "#5d224d", accent: "#60cb99" });
  assert.deepEqual(parseBrandColours(null), { primary: null, accent: null });

  // Grayscale/negative variants lose to the main mark; PDFs are not logos.
  const logo = pickBrandLogo([
    { url: "https://x/gray.png", filename: "logo-grayscale.png", size: 10, type: "image/png" },
    { url: "https://x/main.png", filename: "logo-main-eggplant.png", size: 20, type: "image/png" },
    { url: "https://x/doc.pdf", filename: "brand.pdf", size: 30, type: "application/pdf" },
  ]);
  assert.equal(logo.filename, "logo-main-eggplant.png");
});
