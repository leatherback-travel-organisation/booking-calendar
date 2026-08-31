import assert from "node:assert/strict";
import test from "node:test";

import { detectOverlaps, detectTestingConflicts, scorePair } from "./overlaps.ts";
import { involvedPeople, personKey, stalenessFlag } from "./model.ts";

const nic = { id: null, name: "Nic", email: "nic@example.com" };
const csilla = { id: null, name: "Csilla", email: "csilla@example.com" };
const kat = { id: null, name: "Kat", email: "kat@example.com" };

let nextId = 0;
function makeProject(overrides = {}) {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-9${String(nextId).padStart(11, "0")}`,
    name: `Project ${nextId}`,
    purpose: "Test",
    owner: nic,
    sponsor: null,
    teammates: [],
    growthStage: "Active work",
    estimatedCompletion: null,
    teams: [],
    systems: [],
    brands: [],
    quarterTheme: null,
    projectLink: null,
    notes: "",
    cancellationReason: null,
    testingOwners: [],
    testingTeams: [],
    relatedProjectIds: [],
    demoFields: [],
    createdAt: "2026-08-01T00:00:00Z",
    createdBy: null,
    lastEditedAt: "2026-08-01T00:00:00Z",
    lastEditedBy: null,
    stageChangedAt: "2026-08-01T00:00:00Z",
    completedAt: null,
    cancelledAt: null,
    archivedAt: null,
    ...overrides,
  };
}

test("sharing one common team alone is not an overlap", () => {
  const a = makeProject({ owner: nic, teams: ["Operations"] });
  const b = makeProject({ owner: csilla, teams: ["Operations"] });
  assert.equal(scorePair(a, b).score, 0);
});

test("Google Workspace never counts as a shared system", () => {
  const a = makeProject({ owner: nic, systems: ["Google Workspace"] });
  const b = makeProject({ owner: csilla, systems: ["Google Workspace"] });
  assert.equal(scorePair(a, b).score, 0);
});

test("same specific system plus same team crosses the material threshold with same owner", () => {
  const a = makeProject({ owner: nic, teams: ["Booking Managers"], systems: ["Stacker"] });
  const b = makeProject({ owner: nic, teams: ["Booking Managers"], systems: ["Stacker"] });
  const { score, reasons } = scorePair(a, b);
  // system +3, same owner +2, team+system +3
  assert.equal(score, 8);
  assert.ok(reasons.some((reason) => reason.includes("Stacker")));
  assert.ok(reasons.some((reason) => reason.includes("Nic")));
});

test("owner of one project working as teammate on another counts once", () => {
  const a = makeProject({ owner: nic, systems: ["Stacker"] });
  const b = makeProject({ owner: csilla, teammates: [nic], systems: ["Stacker"] });
  const { score, reasons } = scorePair(a, b);
  // system +3, shared working person +2
  assert.equal(score, 5);
  assert.ok(reasons.some((reason) => reason.includes("Nic")));
});

test("same owner is not double counted as a shared teammate", () => {
  const a = makeProject({ owner: nic });
  const b = makeProject({ owner: nic });
  assert.equal(scorePair(a, b).score, 2);
});

test("shared testers only count when a project is testing", () => {
  const activeA = makeProject({ owner: nic, testingOwners: [kat] });
  const activeB = makeProject({ owner: csilla, testingOwners: [kat] });
  assert.equal(scorePair(activeA, activeB).score, 0);

  const testingA = makeProject({ owner: nic, growthStage: "Testing or roll out", testingOwners: [kat] });
  assert.equal(scorePair(testingA, activeB).score, 3);
});

test("explicitly related projects are always at least material", () => {
  const a = makeProject({ owner: nic });
  const b = makeProject({ owner: csilla, relatedProjectIds: [a.id] });
  const { score } = scorePair(a, b);
  assert.equal(score, 5);
});

test("detectOverlaps skips archived and non-active projects", () => {
  const a = makeProject({ owner: nic, systems: ["Stacker"], teams: ["Operations"] });
  const b = makeProject({ owner: csilla, systems: ["Stacker"], teams: ["Operations"], growthStage: "Complete" });
  const c = makeProject({ owner: csilla, systems: ["Stacker"], teams: ["Operations"], archivedAt: "2026-08-01T00:00:00Z" });
  assert.equal(detectOverlaps([a, b, c]).length, 0);
});

test("detectOverlaps classifies severities by threshold", () => {
  const a = makeProject({ owner: nic, systems: ["Stacker"] });
  const b = makeProject({ owner: csilla, systems: ["Stacker"] });
  const overlaps = detectOverlaps([a, b]);
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].severity, "possible");
});

test("a team testing two projects at once is a testing conflict", () => {
  const a = makeProject({ owner: nic, growthStage: "Testing or roll out", testingTeams: ["Booking Managers"] });
  const b = makeProject({ owner: csilla, growthStage: "Testing or roll out", testingTeams: ["Booking Managers"] });
  const conflicts = detectTestingConflicts([a, b]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].subject, "Booking Managers");
  assert.equal(conflicts[0].subjectKind, "team");
});

test("involved people deduplicate across roles", () => {
  const project = makeProject({ owner: nic, sponsor: nic, teammates: [csilla], testingOwners: [csilla, kat] });
  const keys = involvedPeople(project).map(personKey);
  assert.deepEqual(keys.sort(), ["csilla@example.com", "kat@example.com", "nic@example.com"]);
});

test("staleness flags overdue and quiet projects, never finished ones", () => {
  const now = new Date("2026-08-31T00:00:00Z");
  const overdue = makeProject({ estimatedCompletion: "2026-08-15", lastEditedAt: "2026-07-20T00:00:00Z" });
  assert.equal(stalenessFlag(overdue, now), "overdue");

  const quiet = makeProject({ lastEditedAt: "2026-05-01T00:00:00Z" });
  assert.equal(stalenessFlag(quiet, now), "quiet");

  const fresh = makeProject({ lastEditedAt: "2026-08-30T00:00:00Z" });
  assert.equal(stalenessFlag(fresh, now), null);

  const complete = makeProject({ growthStage: "Complete", lastEditedAt: "2026-01-01T00:00:00Z" });
  assert.equal(stalenessFlag(complete, now), null);

  const editedAfterDue = makeProject({ estimatedCompletion: "2026-08-15", lastEditedAt: "2026-08-20T00:00:00Z" });
  assert.equal(stalenessFlag(editedAfterDue, now), null);
});
