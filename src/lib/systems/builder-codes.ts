import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";

type Row = Record<string, unknown>;

function databaseBoolean(value: unknown) {
  return value === true || value === "true";
}

export type BuilderCodeStatus = "active" | "redeemed" | "revoked" | "expired";

export type BuilderCode = {
  readonly id: string;
  readonly label: string;
  readonly status: BuilderCodeStatus;
  readonly createdByName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly redeemedAt: string | null;
  readonly redeemedByName: string | null;
  readonly revokedAt: string | null;
};

export type BuilderCodeGenerationResult =
  | { ok: true; codeId: string; plainCode: string; message: string }
  | { ok: true; duplicate: true; message: string }
  | { ok: false; message: string };

export type BuilderCodeRevocationResult = { ok: boolean; message: string };

// Human-friendly one-time code: unambiguous alphabet, shown once, never stored.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newPlainCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `LB-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function hashBuilderCode(plainCode: string): string {
  return createHash("sha256").update(plainCode.trim().toUpperCase()).digest("hex");
}

const previewCodes: readonly BuilderCode[] = [
  {
    id: "preview-code-1",
    label: "Demonstration invitation",
    status: "active",
    createdByName: "Preview Operator",
    createdAt: "2026-08-01T09:00:00.000Z",
    expiresAt: "2026-08-08T09:00:00.000Z",
    redeemedAt: null,
    redeemedByName: null,
    revokedAt: null,
  },
];

export async function listBuilderCodes(): Promise<readonly BuilderCode[]> {
  if (identityMode() === "preview") return previewCodes;
  if (!databaseConfigured()) throw new Error("The app-builder code registry is unavailable.");
  const rows = await getSql()`select
      code.id::text as id,
      code.label,
      code.created_at,
      code.expires_at,
      code.redeemed_at,
      code.revoked_at,
      creator.display_name as created_by_name,
      redeemer.display_name as redeemed_by_name
    from app_builder_codes code
    join users creator on creator.id = code.created_by_user_id
    left join users redeemer on redeemer.id = code.redeemed_by_user_id
    order by code.created_at desc
    limit 200` as Row[];
  return rows.map((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const label = typeof row.label === "string" ? row.label : "";
    const createdByName = typeof row.created_by_name === "string" ? row.created_by_name : "";
    if (!id || !label || !createdByName) {
      throw new Error("The app-builder code registry returned an incomplete row.");
    }
    const iso = (value: unknown): string | null =>
      value instanceof Date ? value.toISOString() : typeof value === "string" && value ? new Date(value).toISOString() : null;
    const createdAt = iso(row.created_at);
    const expiresAt = iso(row.expires_at);
    if (!createdAt || !expiresAt) throw new Error("The app-builder code registry returned an invalid timestamp.");
    const redeemedAt = iso(row.redeemed_at);
    const revokedAt = iso(row.revoked_at);
    const status: BuilderCodeStatus = redeemedAt
      ? "redeemed"
      : revokedAt
        ? "revoked"
        : Date.parse(expiresAt) < Date.now()
          ? "expired"
          : "active";
    return {
      id,
      label,
      status,
      createdByName,
      createdAt,
      expiresAt,
      redeemedAt,
      redeemedByName: typeof row.redeemed_by_name === "string" ? row.redeemed_by_name : null,
      revokedAt,
    };
  });
}

export async function generatePostgresBuilderCode(input: {
  requestId: string;
  label: string;
  expiresInDays: number;
  actorUserId: string;
}): Promise<BuilderCodeGenerationResult> {
  const plainCode = newPlainCode();
  const codeHash = hashBuilderCode(plainCode);
  const metadata = JSON.stringify({ label: input.label, expires_in_days: input.expiresInDays });
  const rows = await getSql()`with actor as (
      select u.id
      from users u
      where u.id = ${input.actorUserId}
        and u.population = 'employee'
        and u.status = 'active'
        and exists (
          select 1 from user_platform_roles role
          where role.user_id = u.id
            and role.role::text in ('super_admin', 'systems_admin')
            and role.revoked_at is null
        )
    ), claimed as (
      insert into mutation_keys (key, actor_user_id, action)
      select ${input.requestId}, actor.id, 'systems.builder_code_generated' from actor
      on conflict do nothing returning key
    ), created as (
      insert into app_builder_codes (code_hash, label, created_by_user_id, expires_at)
      select ${codeHash}, ${input.label}, actor.id, now() + make_interval(days => ${input.expiresInDays})
      from actor
      where exists(select 1 from claimed)
      returning id
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
      select 'systems.builder_code_generated', 'success', ${input.actorUserId},
        'builder_code', created.id::text, ${input.requestId}, ${metadata}::jsonb
      from created
    )
    select
      exists(select 1 from actor) as actor_authorized,
      exists(select 1 from claimed) as claimed,
      (select id::text from created) as code_id` as Row[];

  const row = rows[0] ?? {};
  if (!databaseBoolean(row.actor_authorized)) throw new Error("Systems operator access is required.");
  if (!databaseBoolean(row.claimed)) return { ok: true, duplicate: true, message: "This request was already processed." };
  if (typeof row.code_id !== "string" || !row.code_id) throw new Error("The invitation code could not be recorded.");
  return {
    ok: true,
    codeId: row.code_id,
    plainCode,
    message: "Invitation code generated. Copy it now — it is shown only once.",
  };
}

export async function revokePostgresBuilderCode(input: {
  requestId: string;
  codeId: string;
  actorUserId: string;
}): Promise<BuilderCodeRevocationResult> {
  const rows = await getSql()`with actor as (
      select u.id
      from users u
      where u.id = ${input.actorUserId}
        and u.population = 'employee'
        and u.status = 'active'
        and exists (
          select 1 from user_platform_roles role
          where role.user_id = u.id
            and role.role::text in ('super_admin', 'systems_admin')
            and role.revoked_at is null
        )
    ), claimed as (
      insert into mutation_keys (key, actor_user_id, action)
      select ${input.requestId}, actor.id, 'systems.builder_code_revoked' from actor
      on conflict do nothing returning key
    ), revoked as (
      update app_builder_codes code
      set revoked_at = now(), revoked_by_user_id = actor.id
      from actor
      where code.id = ${input.codeId}::uuid
        and code.redeemed_at is null
        and code.revoked_at is null
        and exists(select 1 from claimed)
      returning code.id
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
      select 'systems.builder_code_revoked', 'success', ${input.actorUserId},
        'builder_code', revoked.id::text, ${input.requestId}, '{}'::jsonb
      from revoked
    )
    select
      exists(select 1 from actor) as actor_authorized,
      exists(select 1 from claimed) as claimed,
      exists(select 1 from revoked) as revoked` as Row[];

  const row = rows[0] ?? {};
  if (!databaseBoolean(row.actor_authorized)) throw new Error("Systems operator access is required.");
  if (!databaseBoolean(row.claimed)) return { ok: true, message: "This request was already processed." };
  if (!databaseBoolean(row.revoked)) throw new Error("Only an unused, unexpired code can be revoked.");
  return { ok: true, message: "Invitation code revoked." };
}
