export const COVE_SSO_STATES = [
  "not_configured",
  "changes_prepared",
  "checks_running",
  "needs_attention",
  "ready_for_approval",
  "active",
] as const;

export type CoveSsoState = (typeof COVE_SSO_STATES)[number];

export const COVE_SSO_EVIDENCE_STATUSES = ["pending", "running", "passed", "failed", "unavailable"] as const;
export type CoveSsoEvidenceStatus = (typeof COVE_SSO_EVIDENCE_STATUSES)[number];

export const COVE_SSO_ENVIRONMENT_STATUSES = ["not_configured", "setup_required", "queued", "configured", "verified"] as const;
export type CoveSsoEnvironmentStatus = (typeof COVE_SSO_ENVIRONMENT_STATUSES)[number];

export const COVE_SSO_PRE_APPROVAL_EVIDENCE_KEYS = [
  "canonical_application",
  "canonical_user_role",
  "canonical_admin_role",
  "clerk_satellite_domain",
  "github_change_set",
  "vercel_environment",
  "build",
  "automated_tests",
  "authentication_hygiene",
] as const;

export const COVE_SSO_POST_APPROVAL_EVIDENCE_KEYS = [
  "production_deployment",
  "production_authentication",
] as const;

export const COVE_SSO_REQUIRED_EVIDENCE_KEYS = [
  ...COVE_SSO_PRE_APPROVAL_EVIDENCE_KEYS,
  ...COVE_SSO_POST_APPROVAL_EVIDENCE_KEYS,
] as const;

export type CoveSsoRequiredEvidenceKey = (typeof COVE_SSO_REQUIRED_EVIDENCE_KEYS)[number];

export type CoveSsoEvidence = {
  readonly key: string;
  readonly required: boolean;
  readonly status: CoveSsoEvidenceStatus;
  /** Human-readable provider or command name; never a credential. */
  readonly source: string;
  readonly summary: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly collectedAt?: string;
  readonly validUntil?: string;
};

export type CoveSsoIntegration = {
  readonly id: string;
  readonly managedAssetId: string;
  readonly applicationId: string;
  readonly state: CoveSsoState;
  readonly version: number;
  readonly kitPackage: "@leatherback/cove-auth";
  readonly kitVersion?: string;
  readonly hostname?: string;
  readonly clerkInstanceId?: string;
  readonly clerkSatelliteDomainId?: string;
  readonly githubRepositoryId?: string;
  readonly vercelProjectId?: string;
  readonly githubBranch?: string;
  readonly githubPullRequestNumber?: number;
  readonly githubPullRequestUrl?: string;
  readonly githubCommitSha?: string;
  readonly environmentStatus: CoveSsoEnvironmentStatus;
  readonly approvedByUserId?: string;
  readonly approvedAt?: string;
  readonly approvalNote?: string;
  readonly githubMergedAt?: string;
  readonly deployedAt?: string;
  readonly activatedAt?: string;
  readonly lastAction?: string;
  readonly lastError?: string;
  readonly lastErrorAt?: string;
  readonly evidence: readonly CoveSsoEvidence[];
};

export type CoveSsoStateInput = Pick<
  CoveSsoIntegration,
  | "kitVersion"
  | "hostname"
  | "clerkInstanceId"
  | "clerkSatelliteDomainId"
  | "githubRepositoryId"
  | "vercelProjectId"
  | "githubBranch"
  | "githubPullRequestNumber"
  | "githubPullRequestUrl"
  | "githubCommitSha"
  | "environmentStatus"
  | "approvedByUserId"
  | "approvedAt"
  | "githubMergedAt"
  | "deployedAt"
  | "activatedAt"
  | "lastError"
  | "evidence"
>;

export type CoveSsoValidation = {
  readonly valid: boolean;
  readonly issues: readonly string[];
};

export const COVE_SSO_STATE_PRESENTATION: Readonly<Record<CoveSsoState, { label: string; description: string }>> = {
  not_configured: {
    label: "Not configured",
    description: "Cove has not prepared shared sign-in for this application.",
  },
  changes_prepared: {
    label: "Changes prepared",
    description: "The application changes are ready for automated checks.",
  },
  checks_running: {
    label: "Checks running",
    description: "Cove is collecting real configuration, build and access evidence.",
  },
  needs_attention: {
    label: "Needs attention",
    description: "A check failed or an external service needs action.",
  },
  ready_for_approval: {
    label: "Ready for approval",
    description: "All pre-deployment checks passed and an administrator can review the change.",
  },
  active: {
    label: "Active",
    description: "Shared sign-in is approved, deployed and verified with current evidence.",
  },
};

const allowedTransitions: Readonly<Record<CoveSsoState, ReadonlySet<CoveSsoState>>> = {
  not_configured: new Set(["not_configured", "changes_prepared", "needs_attention"]),
  changes_prepared: new Set(["changes_prepared", "not_configured", "checks_running", "needs_attention"]),
  checks_running: new Set(["checks_running", "changes_prepared", "needs_attention", "ready_for_approval"]),
  needs_attention: new Set(["needs_attention", "changes_prepared", "checks_running", "ready_for_approval"]),
  ready_for_approval: new Set(["ready_for_approval", "changes_prepared", "checks_running", "needs_attention", "active"]),
  active: new Set(["active", "needs_attention"]),
};

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function evidenceByKey(evidence: readonly CoveSsoEvidence[]): Map<string, CoveSsoEvidence> {
  return new Map(evidence.map((item) => [item.key, item]));
}

function currentPassingEvidence(item: CoveSsoEvidence | undefined, now: Date): boolean {
  if (!item || !item.required || item.status !== "passed" || !item.source.trim()) return false;
  const collectedAt = validDate(item.collectedAt);
  const validUntil = validDate(item.validUntil);
  if (!collectedAt || collectedAt.getTime() > now.getTime()) return false;
  return !item.validUntil || Boolean(validUntil && validUntil.getTime() > now.getTime());
}

function configurationIssues(input: CoveSsoStateInput): string[] {
  const issues: string[] = [];
  if (!input.kitVersion) issues.push("The Cove authentication kit version is missing.");
  if (!input.hostname) issues.push("The deployment hostname is missing.");
  if (!input.clerkInstanceId || !input.clerkSatelliteDomainId) issues.push("The Clerk satellite domain is not registered.");
  if (!input.githubRepositoryId || !input.githubBranch || !input.githubPullRequestNumber || !input.githubPullRequestUrl || !input.githubCommitSha) {
    issues.push("The reviewed GitHub change set is incomplete.");
  }
  if (!input.vercelProjectId || input.environmentStatus !== "verified") issues.push("The Vercel environment has not been verified.");
  return issues;
}

export function validateCoveSsoEvidence(
  evidence: readonly CoveSsoEvidence[],
  now: Date = new Date(),
): CoveSsoValidation {
  const issues: string[] = [];
  if (Number.isNaN(now.getTime())) return { valid: false, issues: ["The evidence validation time is invalid."] };

  const seen = new Set<string>();
  for (const item of evidence) {
    if (!/^[a-z][a-z0-9_]*$/.test(item.key)) issues.push("An evidence check has an invalid identifier.");
    if (seen.has(item.key)) issues.push(`Evidence for ${item.key} was recorded more than once.`);
    seen.add(item.key);
    if (!item.source.trim()) issues.push(`Evidence for ${item.key} does not name its real source.`);
    if (!isRecord(item.details)) issues.push(`Evidence details for ${item.key} must be an object.`);
    if (["passed", "failed", "unavailable"].includes(item.status) && !validDate(item.collectedAt)) {
      issues.push(`Evidence for ${item.key} has no valid collection time.`);
    }
    if (item.validUntil) {
      const collectedAt = validDate(item.collectedAt);
      const validUntil = validDate(item.validUntil);
      if (!collectedAt || !validUntil || validUntil.getTime() <= collectedAt.getTime()) {
        issues.push(`Evidence validity for ${item.key} is invalid.`);
      }
    }
  }

  const byKey = evidenceByKey(evidence);
  for (const key of COVE_SSO_REQUIRED_EVIDENCE_KEYS) {
    const item = byKey.get(key);
    if (!item || !item.required) issues.push(`Required evidence for ${key} is missing.`);
  }

  return { valid: issues.length === 0, issues };
}

export function validateCoveSsoTransition(from: CoveSsoState, to: CoveSsoState): CoveSsoValidation {
  const valid = allowedTransitions[from].has(to);
  return {
    valid,
    issues: valid ? [] : [`Cove SSO cannot move from ${COVE_SSO_STATE_PRESENTATION[from].label} to ${COVE_SSO_STATE_PRESENTATION[to].label}.`],
  };
}

export function assertCoveSsoTransition(from: CoveSsoState, to: CoveSsoState): void {
  const result = validateCoveSsoTransition(from, to);
  if (!result.valid) throw new Error(result.issues[0]);
}

export function validateCoveSsoActivation(
  input: CoveSsoStateInput,
  now: Date = new Date(),
): CoveSsoValidation {
  const issues = [...configurationIssues(input)];
  if (Number.isNaN(now.getTime())) return { valid: false, issues: ["The activation validation time is invalid."] };

  const evidenceValidation = validateCoveSsoEvidence(input.evidence, now);
  issues.push(...evidenceValidation.issues);
  const byKey = evidenceByKey(input.evidence);
  for (const key of COVE_SSO_REQUIRED_EVIDENCE_KEYS) {
    if (!currentPassingEvidence(byKey.get(key), now)) issues.push(`The ${key} check has not passed with current evidence.`);
  }

  const approvedAt = validDate(input.approvedAt);
  const mergedAt = validDate(input.githubMergedAt);
  const deployedAt = validDate(input.deployedAt);
  const activatedAt = validDate(input.activatedAt);
  if (!input.approvedByUserId || !approvedAt) issues.push("Administrator approval is missing.");
  if (!mergedAt) issues.push("The approved GitHub change has not been merged.");
  if (!deployedAt) issues.push("The approved change has not been deployed.");
  if (!activatedAt) issues.push("Production activation has not been recorded.");
  if (approvedAt && mergedAt && approvedAt.getTime() > mergedAt.getTime()) issues.push("The GitHub change was merged before administrator approval.");
  if (approvedAt && deployedAt && approvedAt.getTime() > deployedAt.getTime()) issues.push("The deployment happened before administrator approval.");
  if (mergedAt && deployedAt && mergedAt.getTime() > deployedAt.getTime()) issues.push("The deployment predates the merged change.");
  if (deployedAt && activatedAt && deployedAt.getTime() > activatedAt.getTime()) issues.push("Activation predates the production deployment.");
  if (input.lastError) issues.push("The last integration error must be resolved before activation.");

  const productionDeployment = byKey.get("production_deployment");
  const productionAuthentication = byKey.get("production_authentication");
  const deploymentEvidenceAt = validDate(productionDeployment?.collectedAt);
  const authenticationEvidenceAt = validDate(productionAuthentication?.collectedAt);
  if (approvedAt && deploymentEvidenceAt && deploymentEvidenceAt.getTime() < approvedAt.getTime()) {
    issues.push("Production deployment evidence predates administrator approval.");
  }
  if (deployedAt && authenticationEvidenceAt && authenticationEvidenceAt.getTime() < deployedAt.getTime()) {
    issues.push("Production authentication evidence predates deployment.");
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function deriveCoveSsoState(input: CoveSsoStateInput, now: Date = new Date()): CoveSsoState {
  if (validateCoveSsoActivation(input, now).valid) return "active";

  const byKey = evidenceByKey(input.evidence);
  const hasFailure = Boolean(input.lastError) || input.environmentStatus === "setup_required" || input.evidence.some((item) => item.status === "failed" || item.status === "unavailable");
  if (hasFailure) return "needs_attention";

  const preApprovalPassed = configurationIssues(input).length === 0 && COVE_SSO_PRE_APPROVAL_EVIDENCE_KEYS.every((key) => currentPassingEvidence(byKey.get(key), now));
  if (preApprovalPassed && !input.approvedAt) return "ready_for_approval";

  const hasRunningCheck = input.evidence.some((item) => item.status === "running") || Boolean(input.approvedAt && !input.activatedAt);
  if (hasRunningCheck) return "checks_running";

  const hasPreparedChanges = Boolean(input.githubBranch || input.githubCommitSha || input.githubPullRequestNumber);
  return hasPreparedChanges ? "changes_prepared" : "not_configured";
}

const secretField = /(?:^|_)(?:secret|token|password|authorization|cookie|credential|private_key|signing_key|api_key|client_secret)(?:$|_)/i;
const credentialValue = /(?:bearer\s+[a-z0-9._~+/=-]+|sk_(?:live|test)_[a-z0-9_-]+|gh[oprsu]_[a-z0-9_]+|github_pat_[a-z0-9_]+|xox[a-z]-[a-z0-9-]+)/i;
const sensitiveQueryParameter = /^(?:token|secret|password|key|code|authorization|credential)$/i;

function redactString(value: string): string {
  if (credentialValue.test(value)) return "[redacted]";
  let url: URL;
  try { url = new URL(value); } catch { return value; }
  if (url.username || url.password) {
    url.username = "";
    url.password = "";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (sensitiveQueryParameter.test(key)) url.searchParams.set(key, "[redacted]");
  }
  return url.toString();
}

/** Removes reusable credentials before evidence or failures are shown or audited. */
export function redactCoveSsoDetails(value: unknown): unknown {
  const seen = new WeakSet<object>();
  function visit(item: unknown, key?: string): unknown {
    if (key && secretField.test(key)) return "[redacted]";
    if (typeof item === "string") return redactString(item);
    if (!item || typeof item !== "object") return item;
    if (seen.has(item)) return "[circular]";
    seen.add(item);
    if (Array.isArray(item)) return item.map((entry) => visit(entry));
    return Object.fromEntries(Object.entries(item).map(([entryKey, entry]) => [entryKey, visit(entry, entryKey)]));
  }
  return visit(value);
}
