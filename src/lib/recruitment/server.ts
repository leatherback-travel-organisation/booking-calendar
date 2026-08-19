import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";
import {
  knownRecruitmentRoles,
  recruitmentProfileFlags,
  recruitmentStatuses,
  type RecruitmentAttachment,
  type RecruitmentCandidate,
  type RecruitmentEmailTemplate,
  type RecruitmentRole,
  type RecruitmentStatus,
  type RecruitmentWorkspace,
  type RolePublishingStatus,
} from "./model";
import { previewRecruitmentCandidates, previewRecruitmentRoles } from "./preview-data";
import { lakeConfigured, readLakeCandidates, writeLakeCreate, writeLakeUpdate } from "./lake";
import { CV_PARSE_FAILED, isSupportedCv, parseCvAttachment } from "./cv-parsing";
import {
  collectAllRecruitmentRecords,
  recruitmentPageQuery,
  type RecruitmentSourcePage,
  type RecruitmentSourceRecord,
} from "./source";

const DEFAULT_BASE_ID = "appWWdP7HWzwyMw82";
const DEFAULT_TABLE_ID = "tblCcyoxyILhAjZsP";
const RECRUITMENT_CANDIDATES_CACHE_TAG = "recruitment-candidates";
const RECRUITMENT_CANDIDATES_CACHE_SECONDS = 60;
const CV_PARSE_BATCH_SIZE = 5;
const ACTIVE_PIPELINE_STATUSES = new Set<RecruitmentStatus>(["Unreviewed", "Review Later", "Shortlist", "Interview", "Challenge", "2nd Interview", "Final Round", "Reference Checks", "Next opening", "Other Role"]);
const CANDIDATE_FIELDS = ["Name", "Surname", "Job Title", "Notes", "Status", "High Potential", "Email", "Assignee", "Cover Letter", "Resumé", "Interviewer", "First Interview Notes", "Second Interview Notes", "Schedule", "Scenario Challenge", "Samples", "Attachments", "Location:", "Years of Experience", "Most Recent Role / Employer", "Key Skills", "Education Level", "Referral Source", "Last Updated", "Created"];

const defaultEmailTemplates: RecruitmentEmailTemplate[] = [
  { key: "interview", stage: "Interview", label: "Interview invitation", subject: "Let’s find a time to talk", body: "Hi {{candidate_name}},\n\nThank you for your application for {{role_name}}. We’d love to invite you to a first conversation. Please use the link below to choose a time that works for you.\n\n{{scheduling_link}}\n\nKind regards,\nLeatherback Recruitment", enabled: false },
  { key: "challenge", stage: "Challenge", label: "Challenge invitation", subject: "Your {{role_name}} challenge", body: "Hi {{candidate_name}},\n\nWe’d like to invite you to complete a short role-specific challenge. You can view the brief and submit your work using the link below.\n\n{{challenge_link}}\n\nKind regards,\nLeatherback Recruitment", enabled: false },
  { key: "reference-checks", stage: "Reference Checks", label: "Reference-check request", subject: "A quick reference-check form", body: "Hi {{candidate_name}},\n\nYou have progressed to the reference-check stage. Please share your referees’ contact details through the secure form below.\n\n{{reference_form_link}}\n\nKind regards,\nLeatherback Recruitment", enabled: false },
  { key: "talent-pool", stage: "Talent Pool", label: "Talent Pool consent", subject: "May we keep in touch?", body: "Hi {{candidate_name}},\n\nWe are not progressing your application right now, but we would love to keep your details for future opportunities. Please use the link below to let us know whether you consent.\n\n{{consent_link}}\n\nKind regards,\nLeatherback Recruitment", enabled: false },
  { key: "general-rejection", stage: "General Rejection", label: "General rejection", subject: "Thank you for your application", body: "Hi {{candidate_name}},\n\nThank you for the time you invested in your application. We will not be progressing on this occasion, but we wish you every success.\n\nKind regards,\nLeatherback Recruitment", enabled: false },
];

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
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object" && "name" in value) return text((value as Record<string, unknown>).name);
  return "";
}

function texts(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
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

function cvAttachment(record: AirtableRecord) {
  const resumeFiles = safeAttachment(record.fields["Resumé"]);
  const generalFiles = safeAttachment(record.fields.Attachments).filter((attachment) => /(?:^|[\s_.-])(cv|resume|résumé)(?:[\s_.-]|$)/i.test(attachment.filename));
  return [...resumeFiles, ...generalFiles].find((attachment) => isSupportedCv(attachment.filename, attachment.type));
}

async function populateMissingCvFields(records: AirtableRecord[]) {
  if (!process.env.OPENAI_API_KEY?.trim()) return;
  const pending = records.filter((record) => record.id && cvAttachment(record) && (!text(record.fields["Years of Experience"]) || !text(record.fields["Most Recent Role / Employer"]))).slice(0, CV_PARSE_BATCH_SIZE);
  await Promise.all(pending.map(async (record) => {
    const attachment = cvAttachment(record);
    if (!attachment) return;
    try {
      const parsed = await parseCvAttachment(attachment);
      const patch: Record<string, unknown> = {};
      if (!text(record.fields["Years of Experience"])) patch["Years of Experience"] = parsed.readable && parsed.yearsOfExperience !== null ? `${parsed.yearsOfExperience} years` : CV_PARSE_FAILED;
      if (!text(record.fields["Most Recent Role / Employer"])) patch["Most Recent Role / Employer"] = parsed.readable && parsed.mostRecentRoleEmployer ? parsed.mostRecentRoleEmployer : CV_PARSE_FAILED;
      if (!Object.keys(patch).length) return;
      Object.assign(record.fields, patch);
      if (lakeConfigured()) await writeLakeUpdate(record.id, patch);
      else await airtableWrite("PATCH", `/${encodeURIComponent(record.id)}`, { typecast: true, fields: patch });
    } catch (error) {
      // Transport and provider failures are retried on a later source refresh;
      // only a completed parse is allowed to mark a field as unparseable.
      console.error("[recruitment] CV parse failed", { candidateId: record.id, attachmentId: attachment.id, message: error instanceof Error ? error.message : String(error) });
    }
  }));
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
    surname: text(record.fields.Surname) || undefined,
    yearsOfExperience: text(record.fields["Years of Experience"]) || undefined,
    mostRecentRoleEmployer: text(record.fields["Most Recent Role / Employer"]) || undefined,
    keySkills: texts(record.fields["Key Skills"]),
    educationLevel: text(record.fields["Education Level"]) || undefined,
    referralSource: text(record.fields["Referral Source"]) || undefined,
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
    tags: record.fields["High Potential"] === true ? ["Talent Pool / High Potential"] : [],
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

async function readCandidateTags() {
  if (!databaseConfigured()) return new Map<string, string[]>();
  const rows = await getSql()`select candidate_record_id, tag from recruitment_candidate_tags order by tag` as Row[];
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const candidateId = text(row.candidate_record_id);
    const tag = text(row.tag);
    if (!candidateId || !tag) continue;
    grouped.set(candidateId, [...(grouped.get(candidateId) ?? []), tag]);
  }
  return grouped;
}

async function readEmailTemplates(): Promise<RecruitmentEmailTemplate[]> {
  if (!databaseConfigured()) return defaultEmailTemplates;
  const rows = await getSql()`select template_key, stage, subject, body, enabled, updated_at from recruitment_email_templates order by template_key` as Row[];
  const saved = new Map(rows.map((row) => [text(row.template_key), row]));
  return defaultEmailTemplates.map((template) => {
    const row = saved.get(template.key);
    if (!row) return template;
    return {
      ...template,
      stage: status(row.stage),
      subject: text(row.subject) || template.subject,
      body: text(row.body) || template.body,
      enabled: row.enabled === true,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : text(row.updated_at) || undefined,
    };
  });
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

async function readAllHiringCandidates() {
  const config = settings();
  if (!config.token) return null;

  const records = await collectAllRecruitmentRecords((offset) =>
    readCandidatePageFromAirtable(config.baseId, config.tableId, offset ?? ""),
  );

  return { records, truncated: false };
}

// Airtable pagination offsets are temporary cursors. Caching each page kept
// those cursors after Airtable had invalidated them, causing later reads to
// fail with 422. Cache only the completed snapshot so every refresh walks a
// fresh cursor chain from page one.
const readHiringCandidates = unstable_cache(
  readAllHiringCandidates,
  ["recruitment-candidate-snapshot-v2"],
  {
    revalidate: RECRUITMENT_CANDIDATES_CACHE_SECONDS,
    tags: [RECRUITMENT_CANDIDATES_CACHE_TAG],
  },
);

const readLakeCandidateSnapshot = unstable_cache(
  async () => ({ records: await readLakeCandidates(), truncated: false }),
  ["recruitment-lake-snapshot-v1"],
  {
    revalidate: 60,
    tags: [RECRUITMENT_CANDIDATES_CACHE_TAG],
  },
);

function readRecruitmentCandidates() {
  return lakeConfigured() ? readLakeCandidateSnapshot() : readHiringCandidates();
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
  if (identityMode() === "preview") return { candidates: previewRecruitmentCandidates, roles: mergedRoles(previewRecruitmentCandidates, previewRecruitmentRoles), origin: "preview", integrityIssues: 0, writesEnabled: false, truncated: false, emailTemplates: defaultEmailTemplates };
  const [source, configuredRoles, tags, emailTemplates] = await Promise.all([
    readRecruitmentCandidates().catch((error) => {
      logRecruitmentFailure("candidate-source", error);
      return undefined;
    }),
    readRoleConfigurations().catch((error) => {
      logRecruitmentFailure("role-configurations", error);
      return [];
    }),
    readCandidateTags().catch((error) => {
      logRecruitmentFailure("candidate-tags", error);
      return new Map<string, string[]>();
    }),
    readEmailTemplates().catch((error) => {
      logRecruitmentFailure("email-templates", error);
      return defaultEmailTemplates;
    }),
  ]);

  if (!source) return { candidates: [], roles: mergedRoles([], configuredRoles), origin: "unavailable", integrityIssues: 0, writesEnabled: false, truncated: false, emailTemplates };

  await populateMissingCvFields(source.records);
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
  const candidatesWithComments = candidates.map((candidate) => ({
    ...candidate,
    comments: comments.get(candidate.id) ?? [],
    tags: [...new Set([...(candidate.tags ?? []), ...(tags.get(candidate.id) ?? []).map((tag) => tag === "High Potential" ? "Talent Pool / High Potential" : tag)])]
      .filter((tag) => recruitmentProfileFlags.includes(tag as (typeof recruitmentProfileFlags)[number])),
  }));
  return { candidates: candidatesWithComments, roles: mergedRoles(candidatesWithComments, configuredRoles), origin: "airtable", integrityIssues, writesEnabled: true, truncated: source.truncated, emailTemplates };
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
    const source = await readRecruitmentCandidates();
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
  if (lakeConfigured()) {
    await writeLakeUpdate(input.id, fields);
    revalidateTag(RECRUITMENT_CANDIDATES_CACHE_TAG, "max");
    return;
  }
  await airtableWrite("PATCH", `/${encodeURIComponent(input.id)}`, { typecast: true, fields });
}

export async function saveRecruitmentCandidateTags(input: { candidateId: string; tags: string[] }, actorUserId: string) {
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  const fields = { "High Potential": tags.includes("Talent Pool / High Potential") };
  if (lakeConfigured()) {
    await writeLakeUpdate(input.candidateId, fields);
    revalidateTag(RECRUITMENT_CANDIDATES_CACHE_TAG, "max");
  } else {
    await airtableWrite("PATCH", `/${encodeURIComponent(input.candidateId)}`, { fields });
  }
  if (!databaseConfigured()) {
    if (tags.some((tag) => tag !== "Talent Pool / High Potential")) throw new Error("The recruiter flag store is not configured.");
    return;
  }
  const coveOnlyTags = tags.filter((tag) => tag !== "Talent Pool / High Potential");
  const sql = getSql();
  await sql.transaction([
    sql`delete from recruitment_candidate_tags where candidate_record_id = ${input.candidateId}`,
    ...coveOnlyTags.map((tag) => sql`insert into recruitment_candidate_tags (candidate_record_id, tag, updated_by_user_id) values (${input.candidateId}, ${tag}, ${actorUserId})`),
  ]);
}

export async function saveRecruitmentEmailTemplate(input: RecruitmentEmailTemplate, actorUserId: string) {
  if (!databaseConfigured()) throw new Error("The email template store is not configured.");
  await getSql()`insert into recruitment_email_templates (template_key, stage, subject, body, enabled, updated_by_user_id)
    values (${input.key}, ${input.stage}, ${input.subject}, ${input.body}, ${input.enabled}, ${actorUserId})
    on conflict (template_key) do update set stage = excluded.stage, subject = excluded.subject, body = excluded.body, enabled = excluded.enabled, updated_by_user_id = excluded.updated_by_user_id, updated_at = now()`;
}

export async function createRecruitmentCandidate(input: { name: string; email: string; role: string; location: string; notes: string }) {
  const fields = { Name: input.name, Email: input.email || undefined, "Job Title": [input.role], "Location:": input.location || undefined, Notes: input.notes || undefined };
  if (lakeConfigured()) {
    await writeLakeCreate(fields);
    revalidateTag(RECRUITMENT_CANDIDATES_CACHE_TAG, "max");
    return;
  }
  await airtableWrite("POST", "", { typecast: true, fields });
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
