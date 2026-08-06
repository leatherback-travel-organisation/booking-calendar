import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { del, get, head, issueSignedToken, presignUrl } from "@vercel/blob";
import { getSql } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";
import type { User } from "@/lib/access/model";
import { isAppBuilderBriefPath, type AppBuilderRequest, type AppBuilderStatus, type AppBuilderTarget } from "./model";

type Row = Record<string, unknown>;

const ACTIVE = ["reading", "waiting_openai", "making_changes", "preparing_review", "publishing", "reversing"];

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function optional(value: unknown) { const valueText = text(value); return valueText || undefined; }
function iso(value: unknown) { const date = value instanceof Date ? value : new Date(String(value)); return date.toISOString(); }

function mapTarget(row: Row): AppBuilderTarget {
  const common = {
    id: text(row.application_id), applicationId: text(row.application_id), slug: text(row.slug),
    name: text(row.name), description: text(row.description),
    productionUrl: text(row.production_url),
  };
  const executionAssetId = text(row.execution_asset_id);
  const repositoryPath = text(row.repository_path);
  const repositorySource = text(row.repository_source);
  if (executionAssetId && repositoryPath && (repositorySource === "standalone" || repositorySource === "cove")) {
    return { ...common, readiness: "ready", executionAssetId, repositoryPath, repositorySource };
  }
  return { ...common, readiness: "setup_required", repositorySource: "missing" };
}

function mapRequest(row: Row): AppBuilderRequest {
  return {
    id: text(row.id), targetAssetId: text(row.target_asset_id), targetApplicationId: text(row.target_application_id), targetSlug: text(row.target_slug),
    targetName: text(row.target_name), repositoryPath: text(row.repository_path), productionUrl: text(row.production_url),
    requestedByName: text(row.requested_by_name), filename: text(row.filename), notes: text(row.notes),
    status: text(row.status) as AppBuilderStatus, statusDetail: text(row.status_detail),
    responseId: optional(row.openai_response_id), turn: Number(row.agent_turn ?? 0),
    branch: optional(row.branch), pullNumber: row.pull_number == null ? undefined : Number(row.pull_number),
    pullUrl: optional(row.pull_url), publishedCommitSha: optional(row.published_commit_sha),
    reversalPullNumber: row.reversal_pull_number == null ? undefined : Number(row.reversal_pull_number),
    reversalPullUrl: optional(row.reversal_pull_url), reversedCommitSha: optional(row.reversed_commit_sha),
    reversedAt: row.reversed_at == null ? undefined : iso(row.reversed_at),
    summary: optional(row.summary), error: optional(row.error),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

export function appBuilderEngineConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_WEBHOOK_SECRET?.trim() && process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export async function listAppBuilderTargets(user: User): Promise<AppBuilderTarget[]> {
  if (identityMode() === "preview") return [];
  const rows = await getSql()`select
      application.id as application_id,
      application.slug,
      application.name,
      application.description,
      application.launch_url as production_url,
      case
        when direct_asset.repository_path is not null then direct_asset.id
        when application.launch_url ~ '^https://cove\\.leatherbacktravel\\.com(?:/|$)'
          then cove_asset.id
      end as execution_asset_id,
      case
        when direct_asset.repository_path is not null then direct_asset.repository_path
        when application.launch_url ~ '^https://cove\\.leatherbacktravel\\.com(?:/|$)'
          then cove_asset.repository_path
      end as repository_path,
      case
        when direct_asset.repository_path is not null then 'standalone'
        when application.launch_url ~ '^https://cove\\.leatherbacktravel\\.com(?:/|$)'
          and cove_asset.id is not null then 'cove'
        else 'missing'
      end as repository_source
    from applications application
    left join managed_assets direct_asset
      on direct_asset.application_id = application.id
     and direct_asset.asset_kind = 'application'
    left join managed_assets cove_asset
      on cove_asset.application_id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'::uuid
     and cove_asset.asset_kind = 'application'
     and cove_asset.status = 'active'
     and cove_asset.repository_path is not null
    where application.status = 'active'
      and exists (
        select 1 from application_roles role
        join entitlements entitlement on entitlement.role_id = role.id
        where role.application_id = application.id
          and role.access_level = 'admin'
          and entitlement.revoked_at is null
          and (entitlement.starts_at is null or entitlement.starts_at <= now())
          and (entitlement.expires_at is null or entitlement.expires_at > now())
          and (
            (entitlement.subject_type = 'user' and entitlement.user_id = ${user.id}::uuid)
            or (entitlement.subject_type = 'team' and exists (
              select 1 from team_memberships membership
              where membership.team_id = entitlement.team_id
                and membership.user_id = ${user.id}::uuid
                and membership.revoked_at is null
                and (membership.starts_at is null or membership.starts_at <= now())
                and (membership.expires_at is null or membership.expires_at > now())
            ))
          )
      )
    order by application.name` as Row[];
  return rows.map(mapTarget);
}

export async function listAppBuilderRequests(applicationIds: readonly string[]): Promise<AppBuilderRequest[]> {
  if (!applicationIds.length || identityMode() === "preview") return [];
  const rows = await getSql()`select * from app_builder_requests
    where target_application_id = any(${applicationIds}::uuid[])
    order by created_at desc limit 100` as Row[];
  return rows.map(mapRequest);
}

/** App Builder Admin oversight feed. Call only after verifying the Admin role. */
export async function listAllAppBuilderRequests(): Promise<AppBuilderRequest[]> {
  if (identityMode() === "preview") return [];
  const rows = await getSql()`select * from app_builder_requests
    order by created_at desc limit 200` as Row[];
  return rows.map(mapRequest);
}

export async function createAppBuilderRequest(input: {
  user: User; target: Extract<AppBuilderTarget, { readiness: "ready" }>; filename: string; notes: string;
  blobUrl: string; byteSize: number; pdfSha256: string;
}) {
  const id = randomUUID();
  await getSql().transaction([
    getSql()`insert into app_builder_requests (
      id, target_asset_id, target_application_id, target_slug, target_name,
      repository_path, production_url, requested_by_user_id, requested_by_name,
      filename, notes, pdf_sha256
    ) values (
      ${id}, ${input.target.executionAssetId}, ${input.target.applicationId}, ${input.target.slug}, ${input.target.name},
      ${input.target.repositoryPath}, ${input.target.productionUrl}, ${input.user.id}, ${input.user.displayName},
      ${input.filename.slice(0, 180)}, ${input.notes.slice(0, 2000)}, ${input.pdfSha256}
    )`,
    getSql()`insert into app_builder_request_files (request_id, blob_url, byte_size)
      values (${id}, ${input.blobUrl}, ${input.byteSize})`,
  ]);
  return { id };
}

export async function inspectAppBuilderBriefBlob(blobUrl: string) {
  const result = await get(blobUrl, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("The uploaded PDF is unavailable.");
  if (!isAppBuilderBriefPath(result.blob.pathname)) throw new Error("The uploaded file is outside App Builder storage.");
  const reader = result.stream.getReader();
  const digest = createHash("sha256");
  const signature = new Uint8Array(5);
  let signatureBytes = 0;
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    digest.update(value);
    bytesRead += value.byteLength;
    if (signatureBytes < signature.length) {
      const length = Math.min(signature.length - signatureBytes, value.byteLength);
      signature.set(value.subarray(0, length), signatureBytes);
      signatureBytes += length;
    }
  }
  if (bytesRead !== result.blob.size) throw new Error("The uploaded PDF did not transfer completely.");
  return {
    byteSize: bytesRead,
    contentType: result.blob.contentType,
    pathname: result.blob.pathname,
    pdfSha256: digest.digest("hex"),
    signature,
  };
}

export async function claimNextAppBuilderRequest(targetAssetId: string) {
  try {
    const rows = await getSql()`with candidate as (
        select id from app_builder_requests
        where target_asset_id = ${targetAssetId}::uuid and status = 'queued'
        order by created_at, id limit 1
      ), claimed as (
        update app_builder_requests request
        set status = 'reading', status_detail = 'Reading the brief', updated_at = now()
        from candidate
        where request.id = candidate.id
          and not exists (
            select 1 from app_builder_requests active
            where active.target_asset_id = request.target_asset_id
              and active.status = any(${ACTIVE}::text[])
          )
        returning request.*
      ) select * from claimed` as Row[];
    return rows[0] ? mapRequest(rows[0]) : null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("one_active_per_app")) return null;
    throw error;
  }
}

export async function loadAppBuilderBrief(requestId: string) {
  const rows = await getSql()`select pdf_bytes, blob_url from app_builder_request_files where request_id = ${requestId}::uuid` as Row[];
  const bytes = rows[0]?.pdf_bytes;
  const blobUrl = text(rows[0]?.blob_url);
  if (bytes instanceof Uint8Array) return { bytes } as const;
  if (blobUrl) return { blobUrl } as const;
  throw new Error("The uploaded PDF is unavailable.");
}

export async function createAppBuilderBriefReadUrl(blobUrl: string) {
  const metadata = await head(blobUrl);
  const validUntil = Date.now() + 60 * 60 * 1000;
  const signed = await issueSignedToken({ pathname: metadata.pathname, operations: ["get"], validUntil });
  const result = await presignUrl(signed, { operation: "get", pathname: metadata.pathname, access: "private", validUntil, useCache: false });
  return result.presignedUrl;
}

export async function findAppBuilderRequestByResponse(responseId: string) {
  const rows = await getSql()`select * from app_builder_requests where openai_response_id = ${responseId} limit 1` as Row[];
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function findAppBuilderRequestById(id: string) {
  const rows = await getSql()`select * from app_builder_requests where id = ${id}::uuid limit 1` as Row[];
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function listRecoverableAppBuilderResponses(targetIds: readonly string[]) {
  if (!targetIds.length) return [];
  const rows = await getSql()`select openai_response_id from app_builder_requests
    where target_asset_id = any(${targetIds}::uuid[])
      and status = 'waiting_openai'
      and openai_response_id is not null
      and updated_at < now() - interval '20 seconds'
    order by updated_at limit 10` as Row[];
  return rows.map((row) => text(row.openai_response_id)).filter(Boolean);
}

export async function listAppBuilderPublishingRequestIds(targetIds: readonly string[]) {
  if (!targetIds.length) return [];
  const rows = await getSql()`select id from app_builder_requests
    where target_asset_id = any(${targetIds}::uuid[])
      and status in ('needs_approval', 'publishing', 'reversing')
      and pull_number is not null
    order by updated_at limit 20` as Row[];
  return rows.map((row) => text(row.id)).filter(Boolean);
}

export async function claimAppBuilderReversal(id: string, userId: string) {
  const rows = await getSql()`update app_builder_requests
    set status = 'reversing', status_detail = 'Preparing an exact reversal',
      reversed_by_user_id = ${userId}::uuid, error = null, updated_at = now()
    where id = ${id}::uuid and status = 'live' and pull_number is not null
    returning *` as Row[];
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function claimAppBuilderResponse(responseId: string) {
  const rows = await getSql()`update app_builder_requests
    set status = 'making_changes', status_detail = 'Preparing the proposed update', updated_at = now()
    where openai_response_id = ${responseId} and status = 'waiting_openai'
    returning *` as Row[];
  return rows[0] ? mapRequest(rows[0]) : null;
}

export async function updateAppBuilderRequest(id: string, values: {
  status?: AppBuilderStatus; detail?: string; responseId?: string; turn?: number;
  staged?: Record<string, string>; branch?: string; pullNumber?: number; pullUrl?: string;
  publishedCommitSha?: string; reversalPullNumber?: number; reversalPullUrl?: string;
  reversedCommitSha?: string; reversed?: boolean; summary?: string; error?: string;
}) {
  await getSql()`update app_builder_requests set
    status = coalesce(${values.status ?? null}, status),
    status_detail = coalesce(${values.detail ?? null}, status_detail),
    openai_response_id = coalesce(${values.responseId ?? null}, openai_response_id),
    agent_turn = coalesce(${values.turn ?? null}, agent_turn),
    staged_changes = coalesce(${values.staged ? JSON.stringify(values.staged) : null}::jsonb, staged_changes),
    branch = coalesce(${values.branch ?? null}, branch),
    pull_number = coalesce(${values.pullNumber ?? null}, pull_number),
    pull_url = coalesce(${values.pullUrl ?? null}, pull_url),
    published_commit_sha = coalesce(${values.publishedCommitSha ?? null}, published_commit_sha),
    reversal_pull_number = coalesce(${values.reversalPullNumber ?? null}, reversal_pull_number),
    reversal_pull_url = coalesce(${values.reversalPullUrl ?? null}, reversal_pull_url),
    reversed_commit_sha = coalesce(${values.reversedCommitSha ?? null}, reversed_commit_sha),
    reversed_at = case when ${values.reversed ?? false} then now() else reversed_at end,
    summary = coalesce(${values.summary ?? null}, summary),
    error = coalesce(${values.error ?? null}, error),
    updated_at = now()
    where id = ${id}::uuid`;
}

export async function loadAppBuilderStagedChanges(id: string): Promise<Record<string, string>> {
  const rows = await getSql()`select staged_changes from app_builder_requests where id = ${id}::uuid` as Row[];
  const value = rows[0]?.staged_changes;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
}

export async function deleteAppBuilderPdf(id: string) {
  const rows = await getSql()`select blob_url from app_builder_request_files where request_id = ${id}::uuid` as Row[];
  const blobUrl = text(rows[0]?.blob_url);
  await getSql()`delete from app_builder_request_files where request_id = ${id}::uuid`;
  if (blobUrl) await del(blobUrl).catch((error) => console.error("[app-builder] blob cleanup failed", { id, error }));
}
