import assert from "node:assert/strict";
import test from "node:test";

import { parseGitHubTelemetry } from "./github-model.ts";

const repository = {
  full_name: "leatherback-travel-organisation/trtl",
  default_branch: "main",
  private: true,
  archived: false,
  pushed_at: "2026-07-15T08:00:00.000Z",
};

test("GitHub telemetry summarizes completed and pending checks", () => {
  const telemetry = parseGitHubTelemetry({
    expectedRepositoryPath: "leatherback-travel-organisation/trtl",
    repositoryPayload: repository,
    checkRunsPayload: {
      check_runs: [
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
        { status: "completed", conclusion: "failure" },
        { status: "in_progress", conclusion: null },
      ],
    },
    fetchedAt: "2026-07-15T08:05:00.000Z",
  });

  assert.equal(telemetry.state, "connected");
  assert.deepEqual(telemetry.checks, { state: "available", total: 4, passing: 2, failing: 1, pending: 1 });
});

test("GitHub telemetry keeps partial check-run failures explicit", () => {
  const telemetry = parseGitHubTelemetry({
    expectedRepositoryPath: "leatherback-travel-organisation/trtl",
    repositoryPayload: repository,
    checksMessage: "Checks denied.",
    fetchedAt: "2026-07-15T08:05:00.000Z",
  });

  assert.equal(telemetry.state, "connected");
  assert.equal(telemetry.checks?.state, "unavailable");
  assert.equal(telemetry.checks?.message, "Checks denied.");
});

test("GitHub telemetry fails closed for mismatched or malformed responses", () => {
  assert.throws(() => parseGitHubTelemetry({
    expectedRepositoryPath: "leatherback-travel-organisation/trtl",
    repositoryPayload: { ...repository, full_name: "someone-else/trtl" },
    checkRunsPayload: { check_runs: [] },
    fetchedAt: "2026-07-15T08:05:00.000Z",
  }), /different repository/);

  assert.throws(() => parseGitHubTelemetry({
    expectedRepositoryPath: "leatherback-travel-organisation/trtl",
    repositoryPayload: repository,
    checkRunsPayload: { check_runs: [{ conclusion: "success" }] },
    fetchedAt: "2026-07-15T08:05:00.000Z",
  }), /malformed check run/);
});
