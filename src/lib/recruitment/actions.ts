"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { recruitmentStatuses, recruitmentTemplateKeys } from "./model";
import { createRecruitmentCandidate, createRecruitmentComment, saveRecruitmentCandidateTags, saveRecruitmentEmailTemplate, saveRecruitmentRole, updateRecruitmentCandidate } from "./server";

export type RecruitmentActionResult = { ok: true; message: string } | { ok: false; message: string };

const candidateIdPattern = /^rec[A-Za-z0-9]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const candidateUpdateSchema = z.object({
  id: z.string().regex(candidateIdPattern),
  status: z.enum(recruitmentStatuses),
  notes: z.string().trim().max(10_000),
  firstInterviewNotes: z.string().trim().max(20_000).optional(),
  secondInterviewNotes: z.string().trim().max(20_000).optional(),
});

const candidateCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.union([z.literal(""), z.email().max(254)]),
  role: z.string().trim().min(2).max(160),
  location: z.string().trim().max(160),
  notes: z.string().trim().max(10_000),
});

const roleSchema = z.object({
  title: z.string().trim().min(2).max(160),
  status: z.enum(["draft", "ready", "live", "paused", "closed"]),
  hiringManager: z.string().trim().max(160),
  location: z.string().trim().max(160),
  employmentType: z.string().trim().max(120),
  adCopy: z.string().trim().max(12_000),
  adUrl: z.union([z.literal(""), z.url().refine((value) => value.startsWith("https://"), "Use a secure HTTPS link.")]),
  advertisingChannels: z.array(z.string().trim().min(1).max(100)).max(20),
  publishingNotes: z.string().trim().max(5_000),
});

const commentSchema = z.object({
  candidateId: z.string().regex(candidateIdPattern),
  body: z.string().trim().min(1).max(5_000),
});

const candidateTagsSchema = z.object({
  candidateId: z.string().regex(candidateIdPattern),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
});

const emailTemplateSchema = z.object({
  key: z.enum(recruitmentTemplateKeys),
  stage: z.enum(recruitmentStatuses),
  label: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(2).max(240),
  body: z.string().trim().min(20).max(12_000),
  enabled: z.boolean(),
});

function failure(error: unknown): RecruitmentActionResult {
  return { ok: false, message: error instanceof Error ? error.message : "The change could not be saved." };
}

export async function updateRecruitmentCandidateAction(input: unknown): Promise<RecruitmentActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "recruitment", "recruitment.manage_candidates");
    const parsed = candidateUpdateSchema.parse(input);
    await updateRecruitmentCandidate(parsed);
    revalidatePath("/recruitment");
    return { ok: true, message: "Candidate updated." };
  } catch (error) { return failure(error); }
}

export async function createRecruitmentCandidateAction(input: unknown): Promise<RecruitmentActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "recruitment", "recruitment.manage_candidates");
    const parsed = candidateCreateSchema.parse(input);
    await createRecruitmentCandidate(parsed);
    revalidatePath("/recruitment");
    return { ok: true, message: `${parsed.name} added to the hiring inbox.` };
  } catch (error) { return failure(error); }
}

export async function saveRecruitmentRoleAction(input: unknown): Promise<RecruitmentActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    const access = await requireApplicationPermission(identity, "recruitment", "recruitment.manage_roles");
    const parsed = roleSchema.parse(input);
    if (parsed.status === "live" && (!parsed.hiringManager || !parsed.location || !parsed.employmentType || !parsed.adCopy || !parsed.adUrl || parsed.advertisingChannels.length === 0)) {
      return { ok: false, message: "Complete the brief, ad copy, advertising channels and job-ad link before marking this role live." };
    }
    await saveRecruitmentRole({ ...parsed, adUrl: parsed.adUrl || undefined }, access.user.id);
    revalidatePath("/recruitment");
    return { ok: true, message: `${parsed.title} publishing plan saved.` };
  } catch (error) { return failure(error); }
}

export async function createRecruitmentCommentAction(input: unknown): Promise<RecruitmentActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    const access = await requireApplicationPermission(identity, "recruitment", "recruitment.manage_candidates");
    const parsed = commentSchema.parse(input);
    await createRecruitmentComment(parsed, access.user.id);
    revalidatePath("/recruitment");
    return { ok: true, message: "Comment added to the candidate thread." };
  } catch (error) { return failure(error); }
}

export async function saveRecruitmentCandidateTagsAction(input: unknown): Promise<RecruitmentActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    const access = await requireApplicationPermission(identity, "recruitment", "recruitment.manage_candidates");
    const parsed = candidateTagsSchema.parse(input);
    await saveRecruitmentCandidateTags(parsed, access.user.id);
    revalidatePath("/recruitment");
    return { ok: true, message: "Candidate tags saved." };
  } catch (error) { return failure(error); }
}

export async function saveRecruitmentEmailTemplateAction(input: unknown): Promise<RecruitmentActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    const access = await requireApplicationPermission(identity, "recruitment", "recruitment.manage_roles");
    const parsed = emailTemplateSchema.parse(input);
    await saveRecruitmentEmailTemplate(parsed, access.user.id);
    revalidatePath("/recruitment");
    return { ok: true, message: `${parsed.label} template saved. Email sending remains disabled.` };
  } catch (error) { return failure(error); }
}
