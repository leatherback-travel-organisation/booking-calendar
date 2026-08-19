"use server";

// Server actions for the Guest Communications editor. Saves and bulk-applies
// require booking.manage OR the BM's can_edit_communications toggle (granted
// per person by a Pod Lead); preview only needs booking.read. Every save is
// validated against the variable registry BEFORE it touches the database —
// a typo'd {{first_nmae}} is rejected here with the exact bad names — and
// every save is audited.

import { revalidatePath } from "next/cache";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffByEmail } from "@/lib/booking/availability/service";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { renderBrandEmail, renderTemplate, UnknownVariableError, validateTemplate } from "@/lib/booking/notify/render.ts";
import { sampleValues } from "@/lib/booking/notify/variables.ts";
import { isMoment, type Moment } from "@/lib/booking/notify/template-scope.ts";
import { getBrands } from "@/lib/booking/reference/queries";
import type { Brand } from "@/lib/booking/model";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type TemplateActionResult =
  | { ok: true; applied?: number }
  | { ok: false; error: string; unknownVariables?: string[] };

export type PreviewResult =
  | { ok: true; html: string; subject: string }
  | { ok: false; error: string; unknownVariables?: string[] };

type SaveInput = {
  moment: string;
  /** '' = the global default scope. */
  brandKey: string;
  /** '' = all event types. */
  typeKey: string;
  subject: string;
  bodyHtml: string;
};

function validateContent(subject: string, bodyHtml: string): TemplateActionResult | null {
  if (!subject.trim()) return { ok: false, error: "The subject line is empty." };
  if (!bodyHtml.replace(/<[^>]+>/g, "").trim()) return { ok: false, error: "The email body is empty." };
  try {
    validateTemplate(subject);
    validateTemplate(bodyHtml);
  } catch (error) {
    if (error instanceof UnknownVariableError) {
      return {
        ok: false,
        error: "Unknown variables — fix these before saving:",
        unknownVariables: error.variables,
      };
    }
    throw error;
  }
  return null;
}

async function brandByKey(key: string): Promise<Brand | null> {
  const brands = await getBrands();
  return brands.find((brand) => brand.key === key) ?? null;
}

/**
 * Write one scope. The partial unique index only covers active rows, so the
 * "upsert" is update-in-place when an active row exists, insert otherwise;
 * a race on insert is retried as an update instead of surfacing a conflict.
 */
async function writeScope(args: {
  moment: Moment;
  brandId: string | null;
  typeKey: string | null;
  subject: string;
  bodyHtml: string;
  actor: string;
}): Promise<void> {
  const sql = getSql();
  const update = () => sql`
    update booking.message_template
    set subject = ${args.subject}, body_html = ${args.bodyHtml}, updated_by = ${args.actor}, updated_at = now()
    where moment = ${args.moment} and active
      and coalesce(brand_id, ${ZERO_UUID}::uuid) = coalesce(${args.brandId}::uuid, ${ZERO_UUID}::uuid)
      and coalesce(event_type_key, '') = ${args.typeKey ?? ""}
    returning id`;
  const updated = await update();
  if (updated.length > 0) return;
  try {
    await sql`
      insert into booking.message_template (brand_id, event_type_key, moment, subject, body_html, active, updated_by)
      values (${args.brandId}, ${args.typeKey}, ${args.moment}, ${args.subject}, ${args.bodyHtml}, true, ${args.actor})`;
  } catch (error) {
    // Concurrent save created the active row between our update and insert.
    const retried = await update();
    if (retried.length === 0) throw error;
  }
}

async function auditSave(actor: string, moment: Moment, brandKey: string, typeKey: string, via: string): Promise<void> {
  const sql = getSql();
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${actor}, 'template_saved', ${`${moment}:${brandKey || "default"}:${typeKey || "all"}`},
            ${JSON.stringify({ via })}::jsonb)`;
}

function revalidateCommunications(moment: Moment): void {
  revalidatePath("/booking/communications");
  revalidatePath(`/booking/communications/${moment}`);
}

/**
 * Editing is open to Pod Leads and to BMs whose can_edit_communications
 * toggle a Pod Lead has switched on. Throws for everyone else.
 */
async function requireCommsEditor(): Promise<{ email: string }> {
  const access = await requireBookingAccess("booking.read");
  if (access.canManage) return { email: access.identity.email };
  const staff = await getStaffByEmail(access.identity.email);
  if (staff?.canEditCommunications) return { email: access.identity.email };
  throw new Error("Guest Communications editing is limited to toggled team members.");
}

export async function saveTemplate(input: SaveInput): Promise<TemplateActionResult> {
  const identity = await requireCommsEditor();
  if (!databaseConfigured()) return { ok: false, error: "The booking database is not configured." };
  if (!isMoment(input.moment)) return { ok: false, error: "Unknown message moment." };
  const invalid = validateContent(input.subject, input.bodyHtml);
  if (invalid) return invalid;

  let brandId: string | null = null;
  if (input.brandKey) {
    const brand = await brandByKey(input.brandKey);
    if (!brand) return { ok: false, error: `Unknown brand "${input.brandKey}".` };
    brandId = brand.id;
  }

  await writeScope({
    moment: input.moment,
    brandId,
    typeKey: input.typeKey || null,
    subject: input.subject.trim(),
    bodyHtml: input.bodyHtml,
    actor: identity.email,
  });
  await auditSave(identity.email, input.moment, input.brandKey, input.typeKey, "editor");
  revalidateCommunications(input.moment);
  return { ok: true };
}

/**
 * Literal mentions of the source brand (name or alias) become the
 * {{brand.name}} variable, so a copied template greets every target brand
 * by its own name instead of the one it was written for.
 */
function neutralizeBrandMentions(text: string, source: Brand): string {
  let out = text;
  for (const mention of [source.name, ...source.aliases]) {
    if (!mention.trim()) continue;
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "{{brand.name}}");
  }
  return out;
}

export async function applyToMany(input: {
  moment: string;
  subject: string;
  bodyHtml: string;
  /** Brand scope the content was written in; '' = the global default. */
  sourceBrandKey?: string;
  targets: Array<{ brandKey: string; typeKey: string }>;
}): Promise<TemplateActionResult> {
  const identity = await requireCommsEditor();
  if (!databaseConfigured()) return { ok: false, error: "The booking database is not configured." };
  if (!isMoment(input.moment)) return { ok: false, error: "Unknown message moment." };
  if (input.targets.length === 0) return { ok: false, error: "No brands selected." };

  const brands = await getBrands();
  const sourceBrand = input.sourceBrandKey ? brands.find((b) => b.key === input.sourceBrandKey) : null;
  let subject = input.subject;
  let bodyHtml = input.bodyHtml;
  if (sourceBrand) {
    subject = neutralizeBrandMentions(subject, sourceBrand);
    bodyHtml = neutralizeBrandMentions(bodyHtml, sourceBrand);
  }
  const invalid = validateContent(subject, bodyHtml);
  if (invalid) return invalid;
  const resolved: Array<{ brandId: string; brandKey: string; typeKey: string }> = [];
  for (const target of input.targets) {
    const brand = brands.find((candidate) => candidate.key === target.brandKey);
    if (!brand) return { ok: false, error: `Unknown brand "${target.brandKey}".` };
    resolved.push({ brandId: brand.id, brandKey: brand.key, typeKey: target.typeKey });
  }

  for (const target of resolved) {
    await writeScope({
      moment: input.moment,
      brandId: target.brandId,
      typeKey: target.typeKey || null,
      subject: subject.trim(),
      bodyHtml,
      actor: identity.email,
    });
    await auditSave(identity.email, input.moment, target.brandKey, target.typeKey, "copy-to");
  }
  revalidateCommunications(input.moment);
  return { ok: true, applied: resolved.length };
}

/**
 * Full branded-email preview with sample values. Read-only, so any Booking
 * Manager can see exactly what the guest receives — logo, colour, footer,
 * support phone and all.
 */
export async function previewRender(input: {
  brandKey: string;
  subject: string;
  bodyHtml: string;
}): Promise<PreviewResult> {
  await requireBookingAccess("booking.read");

  const values = sampleValues();
  let shell: Parameters<typeof renderBrandEmail>[0] = {
    brandName: "Leatherback Travel",
    logoUrl: null,
    colorPrimary: null,
    supportPhone: values["brand.phone"] ?? null,
    fromName: "Leatherback Travel",
  };
  if (input.brandKey && databaseConfigured()) {
    const brand = await brandByKey(input.brandKey);
    if (!brand) return { ok: false, error: `Unknown brand "${input.brandKey}".` };
    const phone = brand.phoneDefault ?? brand.phoneAu;
    shell = {
      brandName: brand.name,
      logoUrl: brand.logoUrl,
      colorPrimary: brand.colorPrimary,
      supportPhone: phone,
      fromName: brand.fromName,
    };
    // Make the sample sentence match the brand being previewed.
    values["brand.name"] = brand.name;
    if (brand.logoUrl) values["brand.logo"] = brand.logoUrl;
    if (phone) values["brand.phone"] = phone;
  }

  try {
    const subject = renderTemplate(input.subject, values);
    const body = renderTemplate(input.bodyHtml, values);
    return { ok: true, html: renderBrandEmail(shell, body), subject };
  } catch (error) {
    if (error instanceof UnknownVariableError) {
      return { ok: false, error: "Unknown variables:", unknownVariables: error.variables };
    }
    throw error;
  }
}
