import "server-only";

import { z } from "zod";
import { getSql } from "@/lib/db/neon";
import {
  COVE_SSO_EVIDENCE_STATUSES,
  COVE_SSO_ENVIRONMENT_STATUSES,
  COVE_SSO_STATES,
  redactCoveSsoDetails,
  type CoveSsoEvidence,
  type CoveSsoEvidenceStatus,
  type CoveSsoEnvironmentStatus,
  type CoveSsoIntegration,
  type CoveSsoState,
} from "./sso-model";

type Row = Record<string, unknown>;
const uuid = z.string().uuid();

function requiredString(row: Row, key: string) {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Cove SSO field ${key} is invalid.`);
  return value.trim();
}

function optionalString(row: Row, key: string) {
  const value = row[key];
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`Cove SSO field ${key} is invalid.`);
  return value.trim();
}

function optionalTimestamp(row: Row, key: string) {
  const value = row[key];
  if (value == null || value === "") return undefined;
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error(`Cove SSO field ${key} is invalid.`);
  return date.toISOString();
}

function parseEvidence(value: unknown): readonly CoveSsoEvidence[] {
  if (!Array.isArray(value)) throw new Error("Cove SSO evidence is invalid.");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Cove SSO evidence is invalid.");
    const row = raw as Row;
    const status = z.enum(COVE_SSO_EVIDENCE_STATUSES).parse(requiredString(row, "status"));
    const details = row.details;
    if (!details || typeof details !== "object" || Array.isArray(details)) throw new Error("Cove SSO evidence details are invalid.");
    return {
      key: requiredString(row, "check_key"),
      required: row.is_required === true || row.is_required === "true",
      status,
      source: requiredString(row, "source"),
      summary: typeof row.summary === "string" ? row.summary : "",
      details: details as Readonly<Record<string, unknown>>,
      collectedAt: optionalTimestamp(row, "collected_at"),
      validUntil: optionalTimestamp(row, "valid_until"),
    };
  });
}

export function parseCoveSsoIntegrationRow(row: Row): CoveSsoIntegration {
  const state = z.enum(COVE_SSO_STATES).parse(requiredString(row, "state"));
  const environmentStatus = z.enum(COVE_SSO_ENVIRONMENT_STATUSES).parse(requiredString(row, "environment_status"));
  const version = Number(row.version);
  const pullNumber = row.github_pull_request_number == null ? undefined : Number(row.github_pull_request_number);
  if (!Number.isSafeInteger(version) || version < 1 || (pullNumber !== undefined && (!Number.isSafeInteger(pullNumber) || pullNumber < 1))) {
    throw new Error("Cove SSO workflow version data is invalid.");
  }
  return {
    id: uuid.parse(requiredString(row, "id")),
    managedAssetId: uuid.parse(requiredString(row, "managed_asset_id")),
    applicationId: uuid.parse(requiredString(row, "application_id")),
    state,
    version,
    kitPackage: "@leatherback/cove-auth",
    kitVersion: optionalString(row, "kit_version"),
    hostname: optionalString(row, "hostname"),
    clerkInstanceId: optionalString(row, "clerk_instance_id"),
    clerkSatelliteDomainId: optionalString(row, "clerk_satellite_domain_id"),
    githubRepositoryId: optionalString(row, "github_repository_id"),
    vercelProjectId: optionalString(row, "vercel_project_id"),
    githubBranch: optionalString(row, "github_branch"),
    githubPullRequestNumber: pullNumber,
    githubPullRequestUrl: optionalString(row, "github_pull_request_url"),
    githubCommitSha: optionalString(row, "github_commit_sha"),
    environmentStatus,
    approvedByUserId: optionalString(row, "approved_by_user_id"),
    approvedAt: optionalTimestamp(row, "approved_at"),
    approvalNote: optionalString(row, "approval_note"),
    githubMergedAt: optionalTimestamp(row, "github_merged_at"),
    deployedAt: optionalTimestamp(row, "deployed_at"),
    activatedAt: optionalTimestamp(row, "activated_at"),
    lastAction: optionalString(row, "last_action"),
    lastError: optionalString(row, "last_error"),
    lastErrorAt: optionalTimestamp(row, "last_error_at"),
    evidence: parseEvidence(row.evidence ?? []),
  };
}

export async function getPostgresCoveSsoIntegrations(): Promise<readonly CoveSsoIntegration[]> {
  const rows = await getSql()`select integration.*,
      coalesce(evidence.items, '[]'::jsonb) as evidence
    from cove_sso_integrations integration
    left join lateral (
      select jsonb_agg(to_jsonb(item) order by item.check_key) as items
      from cove_sso_evidence item
      where item.integration_id = integration.id
    ) evidence on true
    order by integration.updated_at desc` as Row[];
  return rows.map(parseCoveSsoIntegrationRow);
}

export async function getPostgresCoveSsoIntegration(assetId: string): Promise<CoveSsoIntegration | null> {
  const rows = await getSql()`select integration.*,
      coalesce(evidence.items, '[]'::jsonb) as evidence
    from cove_sso_integrations integration
    left join lateral (
      select jsonb_agg(to_jsonb(item) order by item.check_key) as items
      from cove_sso_evidence item
      where item.integration_id = integration.id
    ) evidence on true
    where integration.managed_asset_id = ${assetId}::uuid` as Row[];
  return rows[0] ? parseCoveSsoIntegrationRow(rows[0]) : null;
}

export async function ensurePostgresCoveSsoIntegration(input: {
  readonly assetId: string;
  readonly applicationId: string;
  readonly actorUserId: string;
  readonly hostname: string;
  readonly requestId: string;
}): Promise<CoveSsoIntegration> {
  const rows = await getSql()`with actor as (
      select user_record.id
      from users user_record
      where user_record.id = ${input.actorUserId}::uuid
        and user_record.status = 'active'
        and exists (
          select 1 from user_platform_roles role
          where role.user_id = user_record.id
            and role.role::text in ('super_admin', 'systems_admin')
            and role.revoked_at is null
        )
    ), target as (
      select asset.id, asset.application_id
      from managed_assets asset
      where asset.id = ${input.assetId}::uuid
        and asset.asset_kind = 'application'
        and asset.application_id = ${input.applicationId}::uuid
    ), created as (
      insert into cove_sso_integrations (
        managed_asset_id, application_id, hostname, last_action, last_request_id,
        created_by_user_id, updated_by_user_id
      )
      select target.id, target.application_id, ${input.hostname}, 'cove_sso.prepare_requested', ${input.requestId}, actor.id, actor.id
      from actor, target
      on conflict (managed_asset_id) do update
      set hostname = excluded.hostname,
          last_action = excluded.last_action,
          last_request_id = excluded.last_request_id,
          updated_by_user_id = excluded.updated_by_user_id
      returning id
    )
    select exists(select 1 from actor) as actor_valid,
      exists(select 1 from target) as target_valid,
      (select id::text from created) as integration_id` as Row[];
  const row = rows[0] ?? {};
  if (!(row.actor_valid === true || row.actor_valid === "true")) throw new Error("Systems administrator approval is required.");
  if (!(row.target_valid === true || row.target_valid === "true")) throw new Error("The canonical application registration is missing.");
  const integration = await getPostgresCoveSsoIntegration(input.assetId);
  if (!integration) throw new Error("Cove could not create the SSO workflow.");
  return integration;
}

export async function recordPostgresCoveSsoEvidence(input: {
  readonly integrationId: string;
  readonly key: string;
  readonly status: CoveSsoEvidenceStatus;
  readonly source: string;
  readonly summary: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly validForMs?: number;
}) {
  const details = JSON.stringify(redactCoveSsoDetails(input.details ?? {}));
  const collected = ["passed", "failed", "unavailable"].includes(input.status);
  const validUntil = collected && input.validForMs ? new Date(Date.now() + input.validForMs).toISOString() : null;
  await getSql()`insert into cove_sso_evidence (
      integration_id, check_key, is_required, status, source, summary, details, collected_at, valid_until
    ) values (
      ${input.integrationId}::uuid, ${input.key}, true, ${input.status}::cove_sso_evidence_status,
      ${input.source}, ${input.summary}, ${details}::jsonb,
      ${collected ? new Date().toISOString() : null}::timestamptz, ${validUntil}::timestamptz
    )
    on conflict (integration_id, check_key) do update set
      status = excluded.status,
      source = excluded.source,
      summary = excluded.summary,
      details = excluded.details,
      collected_at = excluded.collected_at,
      valid_until = excluded.valid_until`;
}

export async function updatePostgresCoveSsoPreparation(input: {
  readonly integrationId: string;
  readonly actorUserId: string;
  readonly state: CoveSsoState;
  readonly kitVersion: string;
  readonly clerkInstanceId?: string;
  readonly clerkDomainId?: string;
  readonly githubRepositoryId?: string;
  readonly vercelProjectId?: string;
  readonly githubBranch?: string;
  readonly pullNumber?: number;
  readonly pullUrl?: string;
  readonly commitSha?: string;
  readonly environmentStatus: CoveSsoEnvironmentStatus;
  readonly requestId: string;
}) {
  await getSql()`update cove_sso_integrations set
      state = ${input.state}::cove_sso_integration_state,
      kit_version = ${input.kitVersion},
      clerk_instance_id = coalesce(${input.clerkInstanceId ?? null}, clerk_instance_id),
      clerk_satellite_domain_id = coalesce(${input.clerkDomainId ?? null}, clerk_satellite_domain_id),
      github_repository_id = coalesce(${input.githubRepositoryId ?? null}, github_repository_id),
      vercel_project_id = coalesce(${input.vercelProjectId ?? null}, vercel_project_id),
      github_branch = coalesce(${input.githubBranch ?? null}, github_branch),
      github_pull_request_number = coalesce(${input.pullNumber ?? null}, github_pull_request_number),
      github_pull_request_url = coalesce(${input.pullUrl ?? null}, github_pull_request_url),
      github_commit_sha = coalesce(${input.commitSha ?? null}, github_commit_sha),
      environment_status = ${input.environmentStatus}::cove_sso_environment_status,
      last_action = 'cove_sso.changes_prepared',
      last_request_id = ${input.requestId},
      last_error = null,
      last_error_at = null,
      updated_by_user_id = ${input.actorUserId}::uuid
    where id = ${input.integrationId}::uuid`;
}

export async function markPostgresCoveSsoState(input: {
  readonly integrationId: string;
  readonly actorUserId: string;
  readonly state: CoveSsoState;
  readonly action: string;
  readonly requestId: string;
  readonly error?: string;
  readonly environmentStatus?: CoveSsoEnvironmentStatus;
}) {
  const safeError = input.error ? String(redactCoveSsoDetails(input.error)).slice(0, 800) : null;
  await getSql()`update cove_sso_integrations set
      state = ${input.state}::cove_sso_integration_state,
      last_action = ${input.action},
      last_request_id = ${input.requestId},
      last_error = ${safeError},
      last_error_at = ${safeError ? new Date().toISOString() : null}::timestamptz,
      environment_status = coalesce(${input.environmentStatus ?? null}::cove_sso_environment_status, environment_status),
      updated_by_user_id = ${input.actorUserId}::uuid
    where id = ${input.integrationId}::uuid`;
}

export async function approvePostgresCoveSsoIntegration(input: {
  readonly integrationId: string;
  readonly actorUserId: string;
  readonly requestId: string;
  readonly note?: string;
}) {
  await getSql()`update cove_sso_integrations set
      state = 'checks_running',
      approved_by_user_id = ${input.actorUserId}::uuid,
      approved_at = now(),
      approval_note = ${input.note?.trim() || null},
      last_action = 'cove_sso.activation_approved',
      last_request_id = ${input.requestId},
      last_error = null,
      last_error_at = null,
      updated_by_user_id = ${input.actorUserId}::uuid
    where id = ${input.integrationId}::uuid
      and state = 'ready_for_approval'`;
}

export async function markPostgresCoveSsoMerged(input: {
  readonly integrationId: string;
  readonly actorUserId: string;
  readonly requestId: string;
  readonly commitSha: string;
}) {
  await getSql()`update cove_sso_integrations set
      github_merged_at = now(),
      github_commit_sha = ${input.commitSha},
      last_action = 'cove_sso.pull_request_merged',
      last_request_id = ${input.requestId},
      updated_by_user_id = ${input.actorUserId}::uuid
    where id = ${input.integrationId}::uuid and approved_at is not null`;
}

export async function markPostgresCoveSsoDeployed(input: {
  readonly integrationId: string;
  readonly actorUserId: string;
  readonly requestId: string;
}) {
  await getSql()`update cove_sso_integrations set
      deployed_at = coalesce(deployed_at, now()),
      last_action = 'cove_sso.production_deployment_verified',
      last_request_id = ${input.requestId},
      updated_by_user_id = ${input.actorUserId}::uuid
    where id = ${input.integrationId}::uuid
      and approved_at is not null
      and github_merged_at is not null`;
}

export async function activatePostgresCoveSsoIntegration(input: {
  readonly integrationId: string;
  readonly actorUserId: string;
  readonly requestId: string;
}) {
  await getSql()`with target as (
      select integration.id, integration.managed_asset_id, integration.application_id
      from cove_sso_integrations integration
      where integration.id = ${input.integrationId}::uuid
        and integration.approved_at is not null
        and integration.github_merged_at is not null
    ), marked as (
      update cove_sso_integrations integration set
        state = 'active',
        environment_status = 'verified',
        deployed_at = coalesce(integration.deployed_at, now()),
        activated_at = now(),
        last_action = 'cove_sso.activated',
        last_request_id = ${input.requestId},
        last_error = null,
        last_error_at = null,
        updated_by_user_id = ${input.actorUserId}::uuid
      from target where integration.id = target.id
      returning target.managed_asset_id, target.application_id
    ), application_updated as (
      update applications application set status = 'active', updated_at = now()
      from marked where application.id = marked.application_id
    )
    update managed_assets asset set status = 'active', updated_at = now()
    from marked where asset.id = marked.managed_asset_id`;
}

export async function updatePostgresManagedAssetVercelProject(assetId: string, projectId: string) {
  await getSql()`update managed_assets set vercel_project_id = ${projectId}, updated_at = now() where id = ${assetId}::uuid`;
}
