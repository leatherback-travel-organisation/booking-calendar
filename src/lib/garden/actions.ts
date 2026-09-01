"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";
import {
  GARDEN_BRANDS,
  GARDEN_SYSTEMS,
  GARDEN_TEAMS,
  GROWTH_STAGES,
  involvedPeople,
  personKey,
  type GardenProject,
  type PersonRef,
} from "./model.ts";
import { detectOverlaps, type ProjectOverlap } from "./overlaps.ts";
import { loadProjects, personMatchesKeys, resolveViewerKeys } from "./server.ts";

export type GardenActionResult = { ok: true; message: string; projectId?: string } | { ok: false; message: string };

const personSchema = z.object({
  id: z.string().max(60).nullable(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(160).nullable(),
});

const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(160),
  purpose: z.string().trim().min(1, "Add a one-sentence purpose.").max(300),
  owner: personSchema,
  sponsor: personSchema.nullable(),
  teammates: z.array(personSchema).max(12),
  growthStage: z.enum(GROWTH_STAGES),
  estimatedCompletion: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  teams: z.array(z.enum(GARDEN_TEAMS)).max(GARDEN_TEAMS.length),
  systems: z.array(z.string().max(80)).max(24),
  brands: z.array(z.enum(GARDEN_BRANDS)).max(GARDEN_BRANDS.length),
  quarterTheme: z.string().trim().max(60).nullable(),
  projectLink: z.string().trim().url().regex(/^https?:\/\//, "Project links must be http(s) URLs.").max(400).nullable(),
  notes: z.string().trim().max(1000),
  cancellationReason: z.string().trim().max(300).nullable(),
  testingOwners: z.array(personSchema).max(12),
  testingTeams: z.array(z.enum(GARDEN_TEAMS)).max(GARDEN_TEAMS.length),
  relatedProjectIds: z.array(z.string().uuid()).max(12),
});

export type GardenProjectInput = z.infer<typeof projectInputSchema>;

const createInputSchema = projectInputSchema.extend({ id: z.string().uuid().optional() });

function conditionalIssue(input: GardenProjectInput): string | null {
  if (input.growthStage === "Cancelled or replaced" && !input.cancellationReason) {
    return "A short cancellation or replacement reason is required.";
  }
  if (
    input.growthStage === "Testing or roll out" &&
    input.testingOwners.length === 0 &&
    input.testingTeams.length === 0
  ) {
    return "Add at least one Testing/Feedback owner (a person or a team).";
  }
  const unknownSystems = input.systems.filter((system) => !GARDEN_SYSTEMS.includes(system));
  if (unknownSystems.length > 0) return `Unknown system: ${unknownSystems[0]}`;
  return null;
}

async function requireGardenWrite(): Promise<{ editor: PersonRef } | { error: GardenActionResult }> {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.write");
  if (identityMode() === "preview" || !databaseConfigured()) {
    return { error: { ok: false, message: "Editing is disabled in the demonstration environment." } };
  }
  return {
    editor: { id: null, name: identity.displayName, email: identity.email?.trim().toLowerCase() ?? null },
  };
}

export async function createGardenProject(rawInput: unknown): Promise<GardenActionResult> {
  const gate = await requireGardenWrite();
  if ("error" in gate) return gate.error;

  const parsed = createInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't validate." };
  const issue = conditionalIssue(parsed.data);
  if (issue) return { ok: false, message: issue };
  const input = parsed.data;

  const sql = getSql();
  try {
  const rows = (await sql`
    insert into garden.projects (
      id,
      name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
      teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
      testing_owners, testing_teams, related_project_ids,
      created_by, last_edited_by,
      completed_at, cancelled_at
    ) values (
      coalesce(${input.id ?? null}::uuid, gen_random_uuid()),
      ${input.name}, ${input.purpose}, ${JSON.stringify(input.owner)},
      ${input.sponsor ? JSON.stringify(input.sponsor) : null},
      ${JSON.stringify(input.teammates)}, ${input.growthStage}, ${input.estimatedCompletion},
      ${input.teams}, ${input.systems}, ${input.brands}, ${input.quarterTheme},
      ${input.projectLink}, ${input.notes}, ${input.cancellationReason},
      ${JSON.stringify(input.testingOwners)}, ${input.testingTeams}, ${input.relatedProjectIds},
      ${JSON.stringify(gate.editor)}, ${JSON.stringify(gate.editor)},
      ${input.growthStage === "Complete" ? new Date().toISOString() : null},
      ${input.growthStage === "Cancelled or replaced" ? new Date().toISOString() : null}
    )
    returning id
  `) as { id: string }[];

  await refreshOverlapLedger();
  revalidatePath("/garden");
  return { ok: true, message: "Project planted in the Garden.", projectId: rows[0]?.id };
  } catch (error) {
    console.error("garden create failed", error);
    return { ok: false, message: "Saving failed — nothing was created. Try again." };
  }
}

export async function updateGardenProject(projectId: string, rawInput: unknown): Promise<GardenActionResult> {
  const gate = await requireGardenWrite();
  if ("error" in gate) return gate.error;
  if (!z.string().uuid().safeParse(projectId).success) return { ok: false, message: "Unknown project." };

  const parsed = projectInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That didn't validate." };
  const issue = conditionalIssue(parsed.data);
  if (issue) return { ok: false, message: issue };
  const input = parsed.data;

  const sql = getSql();
  try {
  const existingRows = (await sql`
    select growth_stage, completed_at, cancelled_at from garden.projects where id = ${projectId}
  `) as { growth_stage: string; completed_at: string | null; cancelled_at: string | null }[];
  if (existingRows.length === 0) return { ok: false, message: "Unknown project." };
  const existing = existingRows[0];
  const stageChanged = existing.growth_stage !== input.growthStage;
  const nowIso = new Date().toISOString();

  const completedAt =
    input.growthStage === "Complete" ? (existing.completed_at ?? nowIso) : null;
  const cancelledAt =
    input.growthStage === "Cancelled or replaced" ? (existing.cancelled_at ?? nowIso) : null;

  await sql`
    update garden.projects set
      name = ${input.name}, purpose = ${input.purpose},
      owner = ${JSON.stringify(input.owner)},
      sponsor = ${input.sponsor ? JSON.stringify(input.sponsor) : null},
      teammates = ${JSON.stringify(input.teammates)},
      growth_stage = ${input.growthStage},
      estimated_completion = ${input.estimatedCompletion},
      teams = ${input.teams}, systems = ${input.systems}, brands = ${input.brands},
      quarter_theme = ${input.quarterTheme}, project_link = ${input.projectLink},
      notes = ${input.notes}, cancellation_reason = ${input.cancellationReason},
      testing_owners = ${JSON.stringify(input.testingOwners)},
      testing_teams = ${input.testingTeams},
      related_project_ids = ${input.relatedProjectIds},
      last_edited_at = now(), last_edited_by = ${JSON.stringify(gate.editor)},
      stage_changed_at = case when ${stageChanged} then now() else stage_changed_at end,
      completed_at = ${completedAt},
      cancelled_at = ${cancelledAt},
      archived_at = case when ${input.growthStage} in ('Complete', 'Cancelled or replaced') then archived_at else null end
    where id = ${projectId}
  `;

  // A fresh cancellation starts acknowledgement collection from scratch.
  if (stageChanged && input.growthStage === "Cancelled or replaced") {
    await sql`delete from garden.acknowledgements where project_id = ${projectId}`;
  }

  await refreshOverlapLedger();
  revalidatePath("/garden");
  return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("garden update failed", error);
    return { ok: false, message: "Saving failed — the change was not stored. Try again." };
  }
}

export async function acknowledgeCancellation(projectId: string): Promise<GardenActionResult> {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.write");
  if (identityMode() === "preview" || !databaseConfigured()) {
    return { ok: false, message: "Acknowledgements are disabled in the demonstration environment." };
  }
  if (!z.string().uuid().safeParse(projectId).success) return { ok: false, message: "Unknown project." };

  const { projects } = await loadProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project || project.growthStage !== "Cancelled or replaced") {
    return { ok: false, message: "This project isn't awaiting acknowledgements." };
  }

  const viewer = await resolveViewerKeys(identity);
  const me = involvedPeople(project).find((person) => personMatchesKeys(person, viewer.keys));
  if (!me) return { ok: false, message: "You're not listed on this project, so no acknowledgement is needed." };

  try {
    const sql = getSql();
    await sql`
      insert into garden.acknowledgements (project_id, person_key, person_name, acknowledged_at)
      values (${projectId}, ${personKey(me)}, ${me.name}, now())
      on conflict (project_id, person_key) do update set acknowledged_at = now()
    `;
  } catch (error) {
    console.error("garden acknowledgement failed", error);
    return { ok: false, message: "That didn't save — try again." };
  }
  revalidatePath("/garden");
  return { ok: true, message: "Acknowledged." };
}

// --- Slack notification ledger -------------------------------------------------
// Material overlaps are posted to Slack once per pair; the garden.overlaps table
// records what has already been sent so unchanged overlaps stay quiet.

function overlapText(overlap: ProjectOverlap, projects: GardenProject[]): string {
  const a = projects.find((project) => project.id === overlap.projectA);
  const b = projects.find((project) => project.id === overlap.projectB);
  if (!a || !b) return "";
  const lines = [
    `:seedling: *Possible project overlap in The Garden*`,
    `*${a.name}* (owner ${a.owner.name}) ↔ *${b.name}* (owner ${b.owner.name})`,
    ...overlap.reasons.map((reason) => `• ${reason}`),
    `<https://cove.leatherbacktravel.com/garden|Open The Garden>`,
  ];
  return lines.join("\n");
}

async function refreshOverlapLedger(): Promise<void> {
  try {
    const { projects, origin } = await loadProjects();
    if (origin !== "database") return;
    const sql = getSql();
    const material = detectOverlaps(projects).filter((overlap) => overlap.severity === "material");

    for (const overlap of material) {
      const [projectA, projectB] = [overlap.projectA, overlap.projectB].sort();
      const rows = (await sql`
        insert into garden.overlaps (project_a, project_b, score, reasons, severity)
        values (${projectA}, ${projectB}, ${overlap.score}, ${JSON.stringify(overlap.reasons)}, 'material')
        on conflict (project_a, project_b) do update set
          score = excluded.score, reasons = excluded.reasons, severity = excluded.severity,
          last_changed_at = case when garden.overlaps.score is distinct from excluded.score then now() else garden.overlaps.last_changed_at end
        returning notified_at
      `) as { notified_at: string | null }[];

      const webhook = process.env.GARDEN_SLACK_WEBHOOK_URL;
      if (!webhook || rows[0]?.notified_at) continue;
      const text = overlapText(overlap, projects);
      if (!text) continue;
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (response.ok) {
        await sql`
          update garden.overlaps set notified_at = now()
          where project_a = ${projectA} and project_b = ${projectB}
        `;
      }
    }
  } catch (error) {
    console.error("garden overlap notification failed", error);
  }
}

// --- Attention-item actions ------------------------------------------------

import { attentionItemKey } from "./model.ts";
import {
  attentionSlackMessage,
  createMeeting,
  meetingConfigured,
  postGardenSlack,
  proposeMeeting,
  resolveAttentionItem,
  slackConfigured,
  slackIdsByEmail,
  type MeetingProposal,
} from "./attention.ts";

const attentionInputSchema = z.object({
  kind: z.enum(["overlap", "testing", "stale"]),
  projectIds: z.array(z.string().uuid()).min(1).max(6),
  subject: z.string().trim().max(80).optional(),
});

export type AttentionActionInput = z.infer<typeof attentionInputSchema>;

type AttentionContext =
  | { error: { ok: false; message: string }; input?: undefined; item?: undefined }
  | { error?: undefined; input: AttentionActionInput; item: NonNullable<ReturnType<typeof resolveAttentionItem>> };

async function resolveAttentionContext(rawInput: unknown): Promise<AttentionContext> {
  const parsed = attentionInputSchema.safeParse(rawInput);
  if (!parsed.success) return { error: { ok: false, message: "That attention item didn't validate." } };
  const { projects } = await loadProjects();
  const matched = parsed.data.projectIds
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is NonNullable<typeof project> => Boolean(project));
  const item = resolveAttentionItem(parsed.data.kind, matched, parsed.data.subject, new Date());
  if (!item) return { error: { ok: false, message: "That attention item no longer applies." } };
  item.key = attentionItemKey(parsed.data.kind, parsed.data.projectIds, parsed.data.subject);
  return { input: parsed.data, item };
}

export async function dismissAttention(rawInput: unknown): Promise<GardenActionResult> {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.write");
  if (identityMode() === "preview" || !databaseConfigured()) return { ok: true, message: "Noted." };
  const parsed = attentionInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "That attention item didn't validate." };
  const viewer = await resolveViewerKeys(identity);
  const personKeyValue = viewer.email ?? [...viewer.keys][0];
  if (!personKeyValue) return { ok: false, message: "Couldn't work out who you are in the directory." };
  const key = attentionItemKey(parsed.data.kind, parsed.data.projectIds, parsed.data.subject);
  try {
    const sql = getSql();
    await sql`
      insert into garden.attention_dismissals (person_key, item_key)
      values (${personKeyValue}, ${key})
      on conflict (person_key, item_key) do nothing
    `;
  } catch (error) {
    console.error("garden dismissal failed", error);
    return { ok: false, message: "That didn't save — try again." };
  }
  revalidatePath("/garden");
  return { ok: true, message: "Noted." };
}

export async function notifyAttentionTeam(rawInput: unknown): Promise<GardenActionResult> {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.write");
  if (identityMode() === "preview") return { ok: false, message: "Demo environment — Slack isn't connected here." };
  if (!slackConfigured()) {
    return { ok: false, message: "Slack isn't connected yet — set GARDEN_SLACK_WEBHOOK_URL (webhook for #notion-automation-testing)." };
  }
  const context = await resolveAttentionContext(rawInput);
  if (context.error) return context.error;

  const slackIds = await slackIdsByEmail();
  const viewer = await resolveViewerKeys(identity);
  const sent = await postGardenSlack(attentionSlackMessage(context.item, slackIds, viewer.name));
  if (!sent) return { ok: false, message: "Slack didn't accept the message — nothing was posted." };

  if (databaseConfigured()) {
    try {
      const sql = getSql();
      await sql`
        insert into garden.attention_notifications (item_key, sent_by)
        values (${context.item.key}, ${viewer.email ?? viewer.name})
      `;
    } catch (error) {
      console.error("garden notification log failed", error);
    }
  }
  const tagged = context.item.people.filter((person) => person.email && slackIds.has(person.email.trim().toLowerCase())).length;
  return { ok: true, message: `Posted to #notion-automation-testing, tagging ${tagged} of ${context.item.people.length} team members.` };
}

export type MeetingProposalResult = { ok: true; proposal: MeetingProposal; title: string } | { ok: false; message: string };

export async function proposeAttentionMeeting(rawInput: unknown): Promise<MeetingProposalResult> {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.write");
  const context = await resolveAttentionContext(rawInput);
  if (context.error) return { ok: false, message: context.error.message };
  const title = `Garden: ${context.item.projects.map((project) => project.name).join(" ↔ ")}`;
  if (identityMode() === "preview") return { ok: false, message: "Demo environment — calendars aren't connected here." };
  if (!meetingConfigured()) return { ok: false, message: "Google Calendar isn't configured (GOOGLE_SA_KEY_B64)." };
  const email = identity.email?.trim().toLowerCase();
  if (!email) return { ok: false, message: "Your account has no verified email to organise from." };

  const people = context.item.people;
  const result = await proposeMeeting(email, people, new Date());
  if ("error" in result) return { ok: false, message: result.error };
  return { ok: true, proposal: result.proposal, title };
}

const confirmMeetingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  attendees: z.array(z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email() })).min(1).max(15),
});

export async function confirmAttentionMeeting(rawInput: unknown): Promise<GardenActionResult> {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "garden", "garden.write");
  if (identityMode() === "preview") return { ok: false, message: "Demo environment — no invites are sent from here." };
  const parsed = confirmMeetingSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "That meeting didn't validate." };
  const email = identity.email?.trim().toLowerCase();
  if (!email) return { ok: false, message: "Your account has no verified email to organise from." };
  const result = await createMeeting(
    email,
    parsed.data.title,
    parsed.data.description,
    parsed.data.startIso,
    parsed.data.endIso,
    parsed.data.attendees,
  );
  if ("error" in result) return { ok: false, message: result.error };
  return {
    ok: true,
    message: result.meetUrl
      ? `Invites sent — Google Meet: ${result.meetUrl}`
      : "Invites sent (Meet link will appear on the calendar event).",
  };
}
