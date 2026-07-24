import assert from "node:assert/strict";
import test from "node:test";
import {
  COVE_SSO_REQUIRED_EVIDENCE_KEYS,
  COVE_SSO_STATE_PRESENTATION,
  COVE_SSO_STATES,
  assertCoveSsoTransition,
  deriveCoveSsoState,
  redactCoveSsoDetails,
  validateCoveSsoActivation,
  validateCoveSsoEvidence,
  validateCoveSsoTransition,
} from "./sso-model.ts";

const now = new Date("2026-07-16T12:00:00.000Z");

function evidence(status = "passed") {
  return COVE_SSO_REQUIRED_EVIDENCE_KEYS.map((key) => ({
    key,
    required: true,
    status,
    source: key.startsWith("clerk") ? "clerk.backend_api" : "superpanel.check_runner",
    summary: `${key} checked`,
    details: { runId: `run-${key}` },
    collectedAt: "2026-07-16T11:00:00.000Z",
    validUntil: "2026-08-16T11:00:00.000Z",
  }));
}

function integration(overrides = {}) {
  return {
    kitVersion: "1.0.0",
    hostname: "supplier-reporting.vercel.app",
    clerkInstanceId: "ins_primary",
    clerkSatelliteDomainId: "dmn_satellite",
    githubRepositoryId: "R_kgDOExample",
    vercelProjectId: "prj_example",
    githubBranch: "cove/sso-integration",
    githubPullRequestNumber: 42,
    githubPullRequestUrl: "https://github.com/leatherback-travel-organisation/supplier-reporting/pull/42",
    githubCommitSha: "a".repeat(40),
    environmentStatus: "verified",
    approvedByUserId: "87f9d918-1f38-4be6-b486-938c028aa739",
    approvedAt: "2026-07-16T10:00:00.000Z",
    githubMergedAt: "2026-07-16T10:15:00.000Z",
    deployedAt: "2026-07-16T10:30:00.000Z",
    activatedAt: "2026-07-16T11:30:00.000Z",
    evidence: evidence(),
    ...overrides,
  };
}

test("the model exposes exactly the six product states and their plain-language labels", () => {
  assert.deepEqual(COVE_SSO_STATES, ["not_configured", "changes_prepared", "checks_running", "needs_attention", "ready_for_approval", "active"]);
  assert.deepEqual(COVE_SSO_STATES.map((state) => COVE_SSO_STATE_PRESENTATION[state].label), [
    "Not configured",
    "Changes prepared",
    "Checks running",
    "Needs attention",
    "Ready for approval",
    "Active",
  ]);
});

test("workflow transitions require checks and approval before Active", () => {
  assert.equal(validateCoveSsoTransition("not_configured", "changes_prepared").valid, true);
  assert.equal(validateCoveSsoTransition("checks_running", "ready_for_approval").valid, true);
  assert.equal(validateCoveSsoTransition("ready_for_approval", "active").valid, true);
  assert.equal(validateCoveSsoTransition("not_configured", "active").valid, false);
  assert.throws(() => assertCoveSsoTransition("changes_prepared", "active"), /cannot move/i);
});

test("state derivation reports preparation, running checks, real failures and approval readiness", () => {
  assert.equal(deriveCoveSsoState(integration({ kitVersion: undefined, githubBranch: undefined, githubCommitSha: undefined, githubPullRequestNumber: undefined, evidence: evidence("pending") }), now), "not_configured");
  assert.equal(deriveCoveSsoState(integration({ kitVersion: undefined, evidence: evidence("pending") }), now), "changes_prepared");
  assert.equal(deriveCoveSsoState(integration({ evidence: evidence("running") }), now), "checks_running");
  assert.equal(deriveCoveSsoState(integration({ evidence: evidence("failed") }), now), "needs_attention");
  assert.equal(deriveCoveSsoState(integration({ approvedByUserId: undefined, approvedAt: undefined, githubMergedAt: undefined, deployedAt: undefined, activatedAt: undefined }), now), "ready_for_approval");
});

test("Active requires approval, post-approval deployment ordering and every current passing check", () => {
  assert.equal(validateCoveSsoActivation(integration(), now).valid, true);
  assert.equal(deriveCoveSsoState(integration(), now), "active");

  const noApproval = validateCoveSsoActivation(integration({ approvedByUserId: undefined, approvedAt: undefined }), now);
  assert.equal(noApproval.valid, false);
  assert.match(noApproval.issues.join(" "), /approval/i);

  const failedApiHygiene = integration({
    evidence: evidence().map((item) => item.key === "authentication_hygiene" ? { ...item, status: "failed" } : item),
  });
  assert.equal(validateCoveSsoActivation(failedApiHygiene, now).valid, false);

  const staleEvidence = integration({
    evidence: evidence().map((item) => item.key === "production_authentication" ? { ...item, validUntil: "2026-07-16T11:30:00.000Z" } : item),
  });
  assert.equal(validateCoveSsoActivation(staleEvidence, now).valid, false);

  const deployedBeforeApproval = validateCoveSsoActivation(integration({ deployedAt: "2026-07-16T09:30:00.000Z" }), now);
  assert.match(deployedBeforeApproval.issues.join(" "), /before administrator approval/i);
});

test("evidence validation rejects missing and duplicated required checks", () => {
  const missing = evidence().slice(1);
  assert.equal(validateCoveSsoEvidence(missing, now).valid, false);
  assert.match(validateCoveSsoEvidence(missing, now).issues.join(" "), /canonical_application/);

  const duplicate = [...evidence(), evidence()[0]];
  assert.match(validateCoveSsoEvidence(duplicate, now).issues.join(" "), /more than once/);
});

test("provider evidence is recursively redacted before display or audit", () => {
  const redacted = redactCoveSsoDetails({
    authorization: "Bearer reusable-token",
    nested: { client_secret: "sk_live_abc123", runId: "run-123" },
    evidenceUrl: "https://example.com/check?token=reusable&run=42",
  });
  assert.deepEqual(redacted, {
    authorization: "[redacted]",
    nested: { client_secret: "[redacted]", runId: "run-123" },
    evidenceUrl: "https://example.com/check?token=%5Bredacted%5D&run=42",
  });
});
