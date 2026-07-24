import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";
import {
  knownRecruitmentRoles,
  recruitmentStatuses,
  type RecruitmentAttachment,
  type RecruitmentCandidate,
  type RecruitmentRole,
  type RecruitmentStatus,
  type RecruitmentWorkspace,
  type RolePublishingStatus,
} from "./model";
import { previewRecruitmentCandidates, previewRecruitmentRoles } from "./preview-data";
import {
  collectAllRecruitmentRecords,
  recruitmentPageQuery,
  type RecruitmentSourcePage,
  type RecruitmentSourceRecord,
} from "./source";

const DEFAULT_BASE_ID = "appWWdP7HWzwyMw82";
const DEFAULT_TABLE_ID = "tblCcyoxyILhAjZsP";
const RECRUITMENT_CANDIDATES_CACHE_TAG = "recruitment-candidates";
const RECRUITMENT_CANDIDATES_CACHE_SECONDS = 3_600;
const ACTIVE_PIPELINE_STATUSES = new Set<RecruitmentStatus>(["Unreviewed", "Shortlist", "Interview", "Challenge", "2nd Interview", "Final Round", "Next opening", "Other Role"]);
const CANDIDATE_FIELDS = ["Name", "Job Title", "Notes", "Status", "Email", "Assignee", "Cover Letter", "Resumé", "Interviewer", "First Interview Notes", "Second Interview Notes", "Schedule", "Scenario Challenge", "Samples", "Attachments", "Location:", "Last Updated", "Created"];

type AirtableRecord = RecruitmentSourceRecord;
type Row = Record<string, unknown>;

class RecruitmentSourceError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "RecruitmentSourceError";
  }
}

function logRecruitmentFailure(stage: string, error: unknown) {
  console.error("[recruitment] read failed", {
    stage,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

function settings() {
  return {
    token: process.env.AIRTABLE_RECRUITMENT_TOKEN,
    baseId: process.env.AIRTABLE_RECRUITMENT_BASE_ID || DEFAULT_BASE_ID,
    tableId: process.env.AIRTABLE_RECRUITMENT_TABLE_ID || DEFAULT_TABLE_ID,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function texts(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function collaboratorName(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  return text(candidate.name) || text(candidate.email) || undefined;
}

function safeAirtableUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || (!url.hostname.endsWith("airtableusercontent.com") && url.hostname !== "dl.airtable.com")) return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}

function safeAttachment(value: unknown): RecruitmentAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Record<string, unknown>;
    const urlValue = safeAirtableUrl(attachment.url);
    if (!urlValue) return [];
    const thumbnails = attachment.thumbnails && typeof attachment.thumbnails === "object" ? attachment.thumbnails as Record<string, unknown> : {};
    const previewUrl = [thumbnails.large, thumbnails.full, thumbnails.small]
      .map((thumbnail) => thumbnail && typeof thumbnail === "object" ? safeAirtableUrl((thumbnail as Record<string, unknown>).url) : undefined)
      .find((candidate) => Boolean(candidate));
    return [{
      id: text(attachment.id) || urlValue,
      filename: text(attachment.filename) || "Attachment",
      url: urlValue,
      type: text(attachment.type) || undefined,
      previewUrl,
    }];
  });
}

function status(value: unknown): RecruitmentStatus {
  const candidate = text(value);
  return recruitmentStatuses.includes(candidate as RecruitmentStatus) ? candidate as RecruitmentStatus : "Unreviewed";
}

function parseCandidate(record: AirtableRecord): RecruitmentCandidate | null {
  const name = text(record.fields.Name);
  if (!record.id || !name) return null;
  const attachments = [
    ...safeAttachment(record.fields["Resumé"]),
    ...safeAttachment(record.fields["Cover Letter"]),
    ...safeAttachment(record.fields["Scenario Challenge"]),
    ...safeAttachment(record.fields.Samples),
    ...safeAttachment(record.fields.Attachments),
  ];
  return {
    id: record.id,
    name,
    email: text(record.fields.Email) || undefined,
    roles: texts(record.fields["Job Title"]),
    status: status(record.fields.Status),
    location: text(record.fields["Location:"]) || undefined,
    schedule: texts(record.fields.Schedule),
    assignee: collaboratorName(record.fields.Assignee),
    interviewer: text(record.fields.Interviewer) || undefined,
    notes: text(record.fields.Notes) || undefined,
    firstInterviewNotes: text(record.fields["First Interview Notes"]) || undefined,
    secondInterviewNotes: text(record.fields["Second Interview Notes"]) || undefined,
    createdAt: text(record.fields.Created) || undefined,
    updatedAt: text(record.fields["Last Updated"]) || undefined,
    attachments,
    comments: [],
  };
}

function commentInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

async function readCandidateComments() {
  if (!databaseConfigured()) return new Map<string, RecruitmentCandidate["comments"]>();
  const rows = await getSql()`select comment.id, comment.candidate_record_id, comment.body, comment.created_at, author.display_name as author_name
    from recruitment_candidate_comments comment
    join users author on author.id = comment.author_user_id
    order by comment.created_at asc
    limit 2000` as Row[];
  const grouped = new Map<string, RecruitmentCandidate["comments"]>();
  for (const row of rows) {
    const candidateId = text(row.candidate_record_id);
    const authorName = text(row.author_name) || "Cove teammate";
    const current = grouped.get(candidateId) ?? [];
    current.push({ id: text(row.id), body: text(row.body), authorName, authorInitials: commentInitials(authorName), createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at) });
    grouped.set(candidateId, current);
  }
  return grouped;
}

async function readCandidatePageFromAirtable(baseId: string, tableId: string, offset: string) {
  const token = settings().token;
  if (!token) throw new Error("Recruitment source is not configured.");
  const query = recruitmentPageQuery(CANDIDATE_FIELDS, offset);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}?${query}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return response.json() as Promise<RecruitmentSourcePage>;

      const retryable = response.status === 429 || response.status >= 500;
      throw new RecruitmentSourceError(`Recruitment source returned ${response.status}.`, retryable);
    } catch (error) {
      if (error instanceof RecruitmentSourceError && !error.retryable) throw error;
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }

  throw new Error("Recruitment source retry loop ended unexpectedly.");
}

const readCandidatePage = unstable_cache(
  readCandidatePageFromAirtable,
  ["recruitment-candidate-page-v1"],
  {
    revalidate: RECRUITMENT_CANDIDATES_CACHE_SECONDS,
    tags: [RECRUITMENT_CANDIDATES_CACHE_TAG],
  },
);

async function readHiringCandidates() {
  const config = settings();
  if (!config.token) return null;

  const records = await collectAllRecruitmentRecords((offset) =>
    readCandidatePage(config.baseId, config.tableId, offset ?? ""),
  );

  return { records, truncated: false };
}

async function readRoleConfigurations(): Promise<RecruitmentRole[]> {
  if (!databaseConfigured()) return [];
  const rows = await getSql()`select title, status, hiring_manager, location, employment_type, ad_copy, ad_url, advertising_channels, publishing_notes, updated_at from recruitment_roles order by title` as Row[];
  return rows.map((row) => ({
    title: text(row.title), status: text(row.status) as RolePublishingStatus, hiringManager: text(row.hiring_manager), location: text(row.location), employmentType: text(row.employment_type), adCopy: text(row.ad_copy), adUrl: text(row.ad_url) || undefined,
    advertisingChannels: Array.isArray(row.advertising_channels) ? row.advertising_channels.filter((item): item is string => typeof item === "string") : [], publishingNotes: text(row.publishing_notes), updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : text(row.updated_at) || undefined, activeCandidates: 0,
  }));
}

function mergedRoles(candidates: RecruitmentCandidate[], configured: RecruitmentRole[]) {
  const configurations = new Map(configured.map((role) => [role.title, role]));
  const titles = new Set<string>([...knownRecruitmentRoles, ...configured.map((role) => role.title), ...candidates.flatMap((candidate) => candidate.roles)]);
  return [...titles].sort((a, b) => a.localeCompare(b)).map((title) => {
    const saved = configurations.get(title);
    return {
      title, status: saved?.status ?? "draft", hiringManager: saved?.hiringManager ?? "", location: saved?.location ?? "", employmentType: saved?.employmentType ?? "", adCopy: saved?.adCopy ?? "", adUrl: saved?.adUrl,
      advertisingChannels: saved?.advertisingChannels ?? [], publishingNotes: saved?.publishingNotes ?? "", updatedAt: saved?.updatedAt, activeCandidates: candidates.filter((candidate) => ACTIVE_PIPELINE_STATUSES.has(candidate.status) && candidate.roles.includes(title)).length,
    } satisfies RecruitmentRole;
  });
}

export async function getRecruitmentWorkspace(): Promise<RecruitmentWorkspace> {
  if (identityMode() === "preview") return { candidates: previewRecruitmentCandidates, roles: mergedRoles(previewRecruitmentCandidates, previewRecruitmentRoles), origin: "preview", integrityIssues: 0, writesEnabled: false, truncated: false };
  const [source, configuredRoles] = await Promise.all([
    readHiringCandidates().catch((error) => {
      logRecruitmentFailure("candidate-source", error);
      return undefined;
    }),
    readRoleConfigurations().catch((error) => {
      logRecruitmentFailure("role-configurations", error);
      return [];
    }),
  ]);

  if (!source) return { candidates: [], roles: mergedRoles([], configuredRoles), origin: "unavailable", integrityIssues: 0, writesEnabled: false, truncated: false };

  let integrityIssues = 0;
  const candidates = source.records.flatMap((record) => {
    const parsed = parseCandidate(record);
    if (!parsed) { integrityIssues += 1; return []; }
    return [parsed];
  });
  const comments = await readCandidateComments().catch((error) => {
    logRecruitmentFailure("candidate-comments", error);
    return new Map<string, RecruitmentCandidate["comments"]>();
  });
  const candidatesWithComments = candidates.map((candidate) => ({ ...candidate, comments: comments.get(candidate.id) ?? [] }));
  return { candidates: candidatesWithComments, roles: mergedRoles(candidatesWithComments, configuredRoles), origin: "airtable", integrityIssues, writesEnabled: true, truncated: source.truncated };
}

export async function getRecruitmentCoverage() {
  if (identityMode() === "preview") {
    return {
      available: true,
      records: previewRecruitmentCandidates.length,
      candidates: previewRecruitmentCandidates.length,
      truncated: false,
    };
  }

  try {
    const source = await readHiringCandidates();
    if (!source) return { available: false, records: 0, candidates: 0, truncated: false };
    return {
      available: true,
      records: source.records.length,
      candidates: source.records.filter((record) => Boolean(parseCandidate(record))).length,
      truncated: source.truncated,
    };
  } catch (error) {
    logRecruitmentFailure("coverage", error);
    return { available: false, records: 0, candidates: 0, truncated: false };
  }
}

async function airtableWrite(method: "POST" | "PATCH", path: string, body: unknown) {
  const config = settings();
  if (!config.token) throw new Error("Recruitment source is not configured.");
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.tableId)}${path}`, {
    method, headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Recruitment source rejected the change (${response.status}).`);
  revalidateTag(RECRUITMENT_CANDIDATES_CACHE_TAG, "max");
}

export async function updateRecruitmentCandidate(input: { id: string; status: RecruitmentStatus; notes: string; firstInterviewNotes?: string; secondInterviewNotes?: string }) {
  const fields: Record<string, unknown> = { Status: input.status === "Unreviewed" ? null : input.status, Notes: input.notes || null };
  if (input.firstInterviewNotes !== undefined) fields["First Interview Notes"] = input.firstInterviewNotes || null;
  if (input.secondInterviewNotes !== undefined) fields["Second Interview Notes"] = input.secondInterviewNotes || null;
  await airtableWrite("PATCH", `/${encodeURIComponent(input.id)}`, { fields });
}

export async function createRecruitmentCandidate(input: { name: string; email: string; role: string; location: string; notes: string }) {
  await airtableWrite("POST", "", { typecast: true, fields: { Name: input.name, Email: input.email || undefined, "Job Title": [input.role], "Location:": input.location || undefined, Notes: input.notes || undefined } });
}

export async function saveRecruitmentRole(input: Omit<RecruitmentRole, "activeCandidates" | "updatedAt">, actorUserId: string) {
  if (!databaseConfigured()) throw new Error("The role publishing store is not configured.");
  const channelsJson = JSON.stringify(input.advertisingChannels);
  await getSql()`insert into recruitment_roles (title, status, hiring_manager, location, employment_type, ad_copy, ad_url, advertising_channels, publishing_notes, updated_by_user_id)
    values (${input.title}, ${input.status}, ${input.hiringManager}, ${input.location}, ${input.employmentType}, ${input.adCopy}, ${input.adUrl ?? null}, array(select jsonb_array_elements_text(${channelsJson}::jsonb)), ${input.publishingNotes}, ${actorUserId})
    on conflict (title) do update set status = excluded.status, hiring_manager = excluded.hiring_manager, location = excluded.location, employment_type = excluded.employment_type, ad_copy = excluded.ad_copy, ad_url = excluded.ad_url, advertising_channels = excluded.advertising_channels, publishing_notes = excluded.publishing_notes, updated_by_user_id = excluded.updated_by_user_id, updated_at = now()`;
}

export async function createRecruitmentComment(input: { candidateId: string; body: string }, actorUserId: string) {
  if (!databaseConfigured()) throw new Error("The candidate discussion store is not configured.");
  await getSql()`insert into recruitment_candidate_comments (candidate_record_id, body, author_user_id) values (${input.candidateId}, ${input.body}, ${actorUserId})`;
}
