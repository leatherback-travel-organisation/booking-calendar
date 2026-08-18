import assert from "node:assert/strict";
import test from "node:test";
import {
  MOMENTS,
  MOMENT_META,
  JOURNEY_STAGES,
  isMoment,
  tokensToChipHtml,
  chipHtmlToTokens,
  displaySource,
  summarizeMoment,
  computeApplyDiff,
} from "./template-scope.ts";

// --- moments ----------------------------------------------------------------

test("the five moments validate and unknown segments do not", () => {
  for (const moment of MOMENTS) assert.equal(isMoment(moment), true);
  assert.equal(isMoment("confirmation "), false);
  assert.equal(isMoment("welcome"), false);
  assert.equal(isMoment("followup"), false);
  assert.equal(isMoment(""), false);
});

test("every moment has metadata and appears in exactly one journey stage", () => {
  const staged = JOURNEY_STAGES.flatMap((stage) => stage.moments);
  assert.deepEqual([...staged].sort(), [...MOMENTS].sort());
  assert.equal(staged.length, MOMENTS.length);
  for (const moment of MOMENTS) assert.ok(MOMENT_META[moment].label.length > 0);
});

// --- chip serialization -----------------------------------------------------

test("tokens become chip spans and chip spans become tokens again", () => {
  const stored = "<p>Hi {{guest.first_name}}, see you {{ booking.meeting_date }}.</p>";
  const editorHtml = tokensToChipHtml(stored);
  assert.equal(
    editorHtml,
    '<p>Hi <span data-variable="guest.first_name"></span>, see you <span data-variable="booking.meeting_date"></span>.</p>',
  );
  assert.equal(
    chipHtmlToTokens(editorHtml),
    "<p>Hi {{guest.first_name}}, see you {{booking.meeting_date}}.</p>",
  );
});

test("chip spans with extra attributes and label text still serialize to tokens", () => {
  const editorHtml =
    '<p>Hi <span class="chip" data-variable="guest.first_name" data-variable-group="guest" contenteditable="false">First name</span>!</p>';
  assert.equal(chipHtmlToTokens(editorHtml), "<p>Hi {{guest.first_name}}!</p>");
});

test("hand-typed mustache text survives serialization untouched for validation to catch", () => {
  const editorHtml = "<p>Hi {{guest.first_nmae}}</p>";
  assert.equal(chipHtmlToTokens(editorHtml), "<p>Hi {{guest.first_nmae}}</p>");
  // And the loader turns even a typo'd-but-well-formed token into a span, so
  // nothing is silently dropped on load either.
  assert.equal(tokensToChipHtml("{{guest.first_nmae}}"), '<span data-variable="guest.first_nmae"></span>');
});

// --- resolution precedence --------------------------------------------------

const BRANDS = [
  { key: "patch", name: "Patch Adventures" },
  { key: "camino", name: "Camino Women" },
];

const ROWS = [
  {
    moment: "confirmation",
    brandKey: null,
    eventTypeKey: null,
    updatedBy: "nicola@leatherbacktravel.com",
    updatedAt: "2026-08-01T10:00:00.000Z",
  },
  {
    moment: "confirmation",
    brandKey: "camino",
    eventTypeKey: null,
    updatedBy: "lisa@caminowomen.com",
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
  {
    moment: "confirmation",
    brandKey: "camino",
    eventTypeKey: "lead-up",
    updatedBy: "lisa@caminowomen.com",
    updatedAt: "2026-08-12T10:00:00.000Z",
  },
];

test("displaySource follows brand-type > brand > default > built-in", () => {
  assert.equal(displaySource(ROWS, "confirmation", "camino", "lead-up"), "brand-type");
  assert.equal(displaySource(ROWS, "confirmation", "camino", "enquiry"), "brand");
  assert.equal(displaySource(ROWS, "confirmation", "camino", null), "brand");
  assert.equal(displaySource(ROWS, "confirmation", "patch", null), "default");
  assert.equal(displaySource(ROWS, "confirmation", null, null), "default");
  assert.equal(displaySource(ROWS, "reminder_24h", "camino", "lead-up"), "built-in");
  assert.equal(displaySource([], "confirmation", "camino", "lead-up"), "built-in");
});

// --- list summaries ---------------------------------------------------------

test("summarizeMoment reports custom default, brand overrides and the latest edit", () => {
  const summary = summarizeMoment("confirmation", ROWS, BRANDS);
  assert.equal(summary.hasCustomDefault, true);
  assert.deepEqual(
    summary.overrides.map((o) => `${o.brandName}:${o.eventTypeKey ?? "*"}`),
    ["Camino Women:*", "Camino Women:lead-up"],
  );
  assert.deepEqual(summary.lastEdited, { by: "lisa@caminowomen.com", at: "2026-08-12T10:00:00.000Z" });
});

test("a moment with no rows summarizes as running on the built-in default", () => {
  const summary = summarizeMoment("cancellation", ROWS, BRANDS);
  assert.equal(summary.hasCustomDefault, false);
  assert.deepEqual(summary.overrides, []);
  assert.equal(summary.lastEdited, null);
});

// --- apply-to-many diff -----------------------------------------------------

test("computeApplyDiff marks existing custom scopes as replace with editor and date", () => {
  const diff = computeApplyDiff(
    "confirmation",
    [
      { brandKey: "camino", eventTypeKey: null },
      { brandKey: "patch", eventTypeKey: null },
    ],
    ROWS,
    BRANDS,
  );
  assert.equal(diff.length, 2);

  const camino = diff.find((row) => row.brandKey === "camino");
  assert.equal(camino.action, "replace");
  assert.equal(camino.existing.updatedBy, "lisa@caminowomen.com");
  assert.ok(camino.summary.includes("Camino Women / Confirmation email"));
  assert.ok(camino.summary.includes("edited by lisa@caminowomen.com"));
  assert.ok(camino.summary.includes("10 Aug 2026"));
  assert.ok(camino.summary.includes("will be replaced"));

  const patch = diff.find((row) => row.brandKey === "patch");
  assert.equal(patch.action, "create");
  assert.equal(patch.existing, null);
  assert.ok(patch.summary.includes("Patch Adventures / Confirmation email"));
  assert.ok(patch.summary.includes("will be created"));
});

test("computeApplyDiff on an untouched moment says built-in default for every target", () => {
  const diff = computeApplyDiff(
    "reschedule",
    [{ brandKey: "patch", eventTypeKey: "lead-up" }],
    ROWS,
    BRANDS,
  );
  assert.equal(diff[0].action, "create");
  assert.ok(diff[0].summary.includes("Patch Adventures (lead-up) / Reschedule confirmation"));
  assert.ok(diff[0].summary.includes("built-in default"));
});

test("brand-and-type replace targets are matched exactly, not by fallback", () => {
  const diff = computeApplyDiff(
    "confirmation",
    [{ brandKey: "camino", eventTypeKey: "lead-up" }],
    ROWS,
    BRANDS,
  );
  assert.equal(diff[0].action, "replace");
  assert.ok(diff[0].summary.includes("Camino Women (lead-up)"));
  assert.ok(diff[0].summary.includes("12 Aug 2026"));
});
