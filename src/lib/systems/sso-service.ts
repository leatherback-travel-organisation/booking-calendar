import "server-only";

import { getAccessSnapshot } from "@/lib/access/server";
import { permissionNamespace } from "@/lib/access/cove-service-contract";
import { requireSystemsOperator } from "@/lib/access/systems-port";
import { databaseConfigured } from "@/lib/db/neon";
import type { VerifiedIdentity } from "@/lib/identity/types";
import { getManagedAssets } from "./server";
import { buildCoveAuthChangeSet, COVE_AUTH_KIT_VERSION } from "./sso-change-set";
import { deriveCoveSsoState, type CoveSsoIntegration } from "./sso-model";
import {
  activatePostgresCoveSsoIntegration,
  approvePostgresCoveSsoIntegration,
  ensurePostgresCoveSsoIntegration,
  getPostgresCoveSsoIntegration,
  getPostgresCoveSsoIntegrations,
  markPostgresCoveSsoDeployed,
  markPostgresCoveSsoMerged,
  markPostgresCoveSsoState,
  recordPostgresCoveSsoEvidence,
  updatePostgresCoveSsoPreparation,
  updatePostgresManagedAssetVercelProject,
} from "./sso-postgres";
import {
  ProviderOperationError,
  ProviderSetupRequiredError,
  approveAndMergePullRequest,
  configureVercelSatelliteEnvironment,
  getPullRequestChecks,
  inspectGitHubNextApplication,
  prepareGitHubPullRequest,
  registerClerkSatelliteDomain,
} from "./sso-providers";

const EVIDENCE_TTL = 24 * 60 * 60_000;
const AUTOMATION_PAUSED_MESSAGE = "Cove migration actions are paused while the legacy-login-safe integration modes and real production sign-in checks are being completed. The estate audit remains available.";

type WorkflowResult = { readonly ok: true; readonly message: string } | { readonly ok: false; readonly message: string };

function automationEnabled() {
  return process.env.COVE_SSO_AUTOMATION_ENABLED === "true";
}

function providerFailure(error: unknown) {
  if (error instanceof ProviderSetupRequiredError || error instanceof ProviderOperationError) return error.message;
  return error instanceof Error ? error.message : "The provider operation failed.";
}

async function evidence(input: Parameters<typeof recordPostgresCoveSsoEvidence>[0]) {
  return recordPostgresCoveSsoEvidence(input);
}

function canonicalAccessIssues(snapshot: Awaited<ReturnType<typeof getAccessSnapshot>>, applicationId: string) {
  const application = snapshot.applications.find((item) => item.id === applicationId);
  if (!application) return { application: "The canonical Cove application record is missing.", user: "User access could not be checked.", admin: "Admin access could not be checked." };
  const namespace = permissionNamespace(application.slug);
  const roles = snapshot.roles.filter((role) => role.applicationId === applicationId);
  const user = roles.find((role) => role.level === "user" && role.key === "user" && role.permissions.includes(`${namespace}.open`));
  const admin = roles.find((role) => role.level === "admin" && role.key === "admin" && role.permissions.includes(`${namespace}.open`) && role.permissions.includes(`${namespace}.manage_access`));
  return {
    application: undefined,
    user: user ? undefined : "The canonical User provision or open permission is missing.",
    admin: admin ? undefined : "The canonical Admin provision or management permission is missing.",
  };
}

export async function getCoveSsoIntegrations(): Promise<readonly CoveSsoIntegration[]> {
  if (!databaseConfigured()) return [];
  return getPostgresCoveSsoIntegrations();
}

export async function prepareCoveSsoIntegration(
  identity: VerifiedIdentity,
  input: { readonly assetId: string; readonly requestId: string },
): Promise<WorkflowResult> {
  const operator = await requireSystemsOperator(identity);
  if (!automationEnabled()) return { ok: false, message: AUTOMATION_PAUSED_MESSAGE };
  if (!databaseConfigured()) return { ok: false, message: "The live Cove workflow database is unavailable." };
  const [assets, snapshot] = await Promise.all([getManagedAssets(), getAccessSnapshot()]);
  const asset = assets.find((item) => item.id === input.assetId && item.assetKind === "application");
  if (!asset?.applicationId) return { ok: false, message: "Choose a registered Cove application." };
  if (!asset.repository) return { ok: false, message: "Connect the application's private company GitHub repository before preparing SSO." };
  const hostname = new URL(asset.productionUrl).hostname.toLowerCase();
  let integration = await ensurePostgresCoveSsoIntegration({
    assetId: asset.id,
    applicationId: asset.applicationId,
    actorUserId: operator.userId,
    hostname,
    requestId: input.requestId,
  });

  const accessIssues = canonicalAccessIssues(snapshot, asset.applicationId);
  await Promise.all([
    evidence({ integrationId: integration.id, key: "canonical_application", status: accessIssues.application ? "failed" : "passed", source: "cove.auth_access", summary: accessIssues.application ?? "The managed asset is linked to the canonical Cove application.", validForMs: EVIDENCE_TTL }),
    evidence({ integrationId: integration.id, key: "canonical_user_role", status: accessIssues.user ? "failed" : "passed", source: "cove.auth_access", summary: accessIssues.user ?? "The canonical User provision and open permission are present.", validForMs: EVIDENCE_TTL }),
    evidence({ integrationId: integration.id, key: "canonical_admin_role", status: accessIssues.admin ? "failed" : "passed", source: "cove.auth_access", summary: accessIssues.admin ?? "The canonical Admin provision and management permission are present.", validForMs: EVIDENCE_TTL }),
  ]);

  let clerkDomainId: string | undefined;
  let clerkInstanceId: string | undefined;
  let pull: Awaited<ReturnType<typeof prepareGitHubPullRequest>> | undefined;
  let vercelProjectId: string | undefined;
  let environmentStatus: "setup_required" | "verified" = "verified";
  const failures: string[] = Object.values(accessIssues).filter((message): message is string => Boolean(message));

  try {
    const clerk = await registerClerkSatelliteDomain(hostname);
    clerkDomainId = clerk.domainId;
    clerkInstanceId = clerk.instanceId;
    await evidence({ integrationId: integration.id, key: "clerk_satellite_domain", status: "passed", source: "clerk.backend_api", summary: `Clerk confirms ${hostname} as a satellite domain.`, details: { domainId: clerk.domainId, created: clerk.created }, validForMs: EVIDENCE_TTL });
  } catch (error) {
    const message = providerFailure(error);
    failures.push(message);
    await evidence({ integrationId: integration.id, key: "clerk_satellite_domain", status: error instanceof ProviderSetupRequiredError ? "unavailable" : "failed", source: "clerk.backend_api", summary: message });
  }

  try {
    const source = await inspectGitHubNextApplication(asset.repository.path);
    const changeSet = buildCoveAuthChangeSet({ applicationId: asset.applicationId, applicationSlug: asset.slug, source });
    if (!Object.keys(changeSet.files).includes("packages/cove-auth/package.json")) {
      throw new ProviderOperationError("github", "The vendored Cove authentication package is missing from the prepared change set.");
    }
    pull = await prepareGitHubPullRequest({
      repositoryPath: asset.repository.path,
      branch: `cove-auth/${asset.slug}-v${COVE_AUTH_KIT_VERSION.split(".")[0]}`,
      title: `Integrate Cove authentication kit v${COVE_AUTH_KIT_VERSION}`,
      body: [
        "## Cove shared sign-in",
        "",
        "This draft installs the versioned Leatherback Cove authentication kit, configures Clerk satellite session sync, adds fresh server-side Cove entitlement enforcement, and exposes production hygiene evidence.",
        "",
        "SuperPanel will not merge or activate this change until a Systems Admin approves it after real checks pass.",
        changeSet.manualAction ? `\n### Manual review required\n\n${changeSet.manualAction}` : "",
      ].join("\n"),
      files: changeSet.files,
    });
    if (changeSet.manualAction) failures.push(changeSet.manualAction);
    await evidence({
      integrationId: integration.id,
      key: "github_change_set",
      status: changeSet.manualAction ? "failed" : "passed",
      source: "github.pull_request",
      summary: changeSet.manualAction ?? `GitHub pull request #${pull.number} contains the versioned Cove integration change set.`,
      details: { pullRequest: pull.number, commitSha: pull.commitSha },
      validForMs: EVIDENCE_TTL,
    });
  } catch (error) {
    const message = providerFailure(error);
    failures.push(message);
    await evidence({ integrationId: integration.id, key: "github_change_set", status: error instanceof ProviderSetupRequiredError ? "unavailable" : "failed", source: "github.app", summary: message });
  }

  try {
    const vercel = await configureVercelSatelliteEnvironment({
      hostname,
      applicationId: asset.applicationId,
      applicationSlug: asset.slug,
      knownProjectId: asset.vercelProjectId,
    });
    vercelProjectId = vercel.projectId;
    await updatePostgresManagedAssetVercelProject(asset.id, vercel.projectId);
    await evidence({ integrationId: integration.id, key: "vercel_environment", status: "passed", source: "vercel.projects.env", summary: `Vercel confirms all ${vercel.configuredKeys.length} required production settings.`, details: { projectId: vercel.projectId, keys: vercel.configuredKeys }, validForMs: EVIDENCE_TTL });
  } catch (error) {
    const message = providerFailure(error);
    failures.push(message);
    environmentStatus = "setup_required";
    await evidence({ integrationId: integration.id, key: "vercel_environment", status: error instanceof ProviderSetupRequiredError ? "unavailable" : "failed", source: "vercel.projects.env", summary: message });
  }

  const preparedState = failures.length > 0 ? "needs_attention" : "changes_prepared";
  await updatePostgresCoveSsoPreparation({
    integrationId: integration.id,
    actorUserId: operator.userId,
    state: preparedState,
    kitVersion: COVE_AUTH_KIT_VERSION,
    clerkInstanceId,
    clerkDomainId,
    githubRepositoryId: pull?.repositoryId,
    vercelProjectId,
    githubBranch: pull?.branch,
    pullNumber: pull?.number,
    pullUrl: pull?.url,
    commitSha: pull?.commitSha,
    environmentStatus,
    requestId: input.requestId,
  });
  if (failures.length > 0) {
    await markPostgresCoveSsoState({ integrationId: integration.id, actorUserId: operator.userId, state: "needs_attention", action: "cove_sso.setup_required", requestId: input.requestId, error: failures.join(" "), environmentStatus });
    return { ok: false, message: failures.join(" ") };
  }
  await markPostgresCoveSsoState({ integrationId: integration.id, actorUserId: operator.userId, state: "checks_running", action: "cove_sso.checks_started", requestId: input.requestId });
  integration = (await getPostgresCoveSsoIntegration(asset.id)) ?? integration;
  return { ok: true, message: `Cove prepared pull request #${integration.githubPullRequestNumber}; checks are running and nothing has been merged or deployed.` };
}

async function productionHealth(integration: CoveSsoIntegration, productionUrl: string) {
  const response = await fetch(new URL("/.well-known/cove-access", productionUrl), {
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "application/json", "User-Agent": "Cove-SSO-Evidence/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload) throw new Error(`The production Cove authentication endpoint returned HTTP ${response.status}.`);
  const application = payload.application as Record<string, unknown> | undefined;
  const checks = payload.checks;
  const applicationMatches = application?.applicationId === integration.applicationId || application?.id === integration.applicationId;
  if (payload.kitVersion !== integration.kitVersion || payload.provider !== "cove" || payload.enforced !== true || payload.status !== "ready" || !applicationMatches) {
    throw new Error("The production Cove authentication evidence does not match the approved application and kit version.");
  }
  if (!Array.isArray(checks) || checks.some((check) => !check || typeof check !== "object" || (check as { status?: unknown }).status !== "pass")) {
    throw new Error("The production Cove authentication endpoint reports a failed configuration check.");
  }
  if (integration.githubCommitSha && payload.deploymentCommitSha !== integration.githubCommitSha) {
    throw new Error("Production is not yet running the approved Cove authentication commit.");
  }
  return payload;
}

export async function refreshCoveSsoIntegration(
  identity: VerifiedIdentity,
  input: { readonly assetId: string; readonly requestId: string },
): Promise<WorkflowResult> {
  const operator = await requireSystemsOperator(identity);
  if (!automationEnabled()) return { ok: false, message: AUTOMATION_PAUSED_MESSAGE };
  const assets = await getManagedAssets();
  const asset = assets.find((item) => item.id === input.assetId && item.assetKind === "application");
  if (!asset?.repository) return { ok: false, message: "The application repository is not connected." };
  let integration = await getPostgresCoveSsoIntegration(asset.id);
  if (!integration?.githubPullRequestNumber) return { ok: false, message: "Prepare the Cove authentication changes first." };

  try {
    const checks = await getPullRequestChecks(asset.repository.path, integration.githubPullRequestNumber);
    const status = checks.total > 0 && checks.failing === 0 && checks.pending === 0 ? "passed" : checks.failing > 0 || checks.total === 0 ? "failed" : "running";
    const summary = checks.total === 0 ? "GitHub found no automated checks on the prepared commit." : checks.failing > 0 ? `${checks.failing} GitHub check${checks.failing === 1 ? " is" : "s are"} failing.` : checks.pending > 0 ? `${checks.pending} GitHub check${checks.pending === 1 ? " is" : "s are"} still running.` : `${checks.passing} GitHub checks passed.`;
    await Promise.all([
      evidence({ integrationId: integration.id, key: "build", status, source: "github.check_runs", summary, details: { total: checks.total, passing: checks.passing, failing: checks.failing, pending: checks.pending }, validForMs: EVIDENCE_TTL }),
      evidence({ integrationId: integration.id, key: "automated_tests", status, source: "github.check_runs", summary: status === "passed" ? "The repository test command, including the Cove kit tests, passed in CI." : summary, details: { commitSha: checks.headSha }, validForMs: EVIDENCE_TTL }),
      evidence({ integrationId: integration.id, key: "authentication_hygiene", status, source: "github.check_runs", summary: status === "passed" ? "The versioned Cove kit configuration and server-enforcement tests passed in CI." : summary, details: { commitSha: checks.headSha }, validForMs: EVIDENCE_TTL }),
    ]);

    integration = (await getPostgresCoveSsoIntegration(asset.id)) ?? integration;
    if (integration.approvedAt && integration.githubMergedAt) {
      const health = await productionHealth(integration, asset.productionUrl);
      await markPostgresCoveSsoDeployed({ integrationId: integration.id, actorUserId: operator.userId, requestId: input.requestId });
      await evidence({ integrationId: integration.id, key: "production_deployment", status: "passed", source: "vercel.production", summary: "The approved Cove authentication build is live on the registered production hostname.", details: { hostname: new URL(asset.productionUrl).hostname, commitSha: health.deploymentCommitSha }, validForMs: 60 * 60_000 });
      await evidence({ integrationId: integration.id, key: "production_authentication", status: "passed", source: "subapp.cove_health", summary: "The live Sub-App reports the approved kit, canonical application, satellite sync and server entitlement enforcement.", details: { schema: health.schema, kitVersion: health.kitVersion }, validForMs: 60 * 60_000 });
      await activatePostgresCoveSsoIntegration({ integrationId: integration.id, actorUserId: operator.userId, requestId: input.requestId });
      return { ok: true, message: "Cove shared sign-in is active and production evidence passed." };
    }

    const next = deriveCoveSsoState(integration);
    const state = status === "failed" ? "needs_attention" : next === "ready_for_approval" ? "ready_for_approval" : "checks_running";
    await markPostgresCoveSsoState({
      integrationId: integration.id,
      actorUserId: operator.userId,
      state,
      action: state === "ready_for_approval" ? "cove_sso.ready_for_approval" : "cove_sso.checks_refreshed",
      requestId: input.requestId,
      error: status === "failed" ? summary : undefined,
    });
    return { ok: status !== "failed", message: state === "ready_for_approval" ? "All preparation checks passed. Admin approval is required before merge and deployment." : summary };
  } catch (error) {
    const message = providerFailure(error);
    await markPostgresCoveSsoState({ integrationId: integration.id, actorUserId: operator.userId, state: "needs_attention", action: "cove_sso.check_failed", requestId: input.requestId, error: message });
    return { ok: false, message };
  }
}

export async function approveCoveSsoIntegration(
  identity: VerifiedIdentity,
  input: { readonly assetId: string; readonly requestId: string; readonly note?: string },
): Promise<WorkflowResult> {
  const operator = await requireSystemsOperator(identity);
  if (!automationEnabled()) return { ok: false, message: AUTOMATION_PAUSED_MESSAGE };
  const assets = await getManagedAssets();
  const asset = assets.find((item) => item.id === input.assetId && item.assetKind === "application");
  if (!asset?.repository) return { ok: false, message: "The application repository is not connected." };
  const integration = await getPostgresCoveSsoIntegration(asset.id);
  if (!integration || integration.state !== "ready_for_approval" || !integration.githubPullRequestNumber) {
    return { ok: false, message: "The integration is not ready for Admin approval." };
  }
  await approvePostgresCoveSsoIntegration({ integrationId: integration.id, actorUserId: operator.userId, requestId: input.requestId, note: input.note });
  try {
    const merged = await approveAndMergePullRequest({ repositoryPath: asset.repository.path, pullNumber: integration.githubPullRequestNumber, commitTitle: `Activate Cove authentication kit v${integration.kitVersion}` });
    await markPostgresCoveSsoMerged({ integrationId: integration.id, actorUserId: operator.userId, requestId: input.requestId, commitSha: merged.commitSha });
    return { ok: true, message: "Admin approval was recorded and the reviewed pull request was merged. Cove is waiting for real production evidence before activation." };
  } catch (error) {
    const message = providerFailure(error);
    await markPostgresCoveSsoState({ integrationId: integration.id, actorUserId: operator.userId, state: "needs_attention", action: "cove_sso.merge_failed", requestId: input.requestId, error: message });
    return { ok: false, message: `Approval was recorded, but GitHub did not merge the change: ${message}` };
  }
}
