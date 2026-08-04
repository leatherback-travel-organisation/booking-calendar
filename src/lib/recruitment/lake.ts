import "server-only";

import { Pool, type PoolClient } from "pg";
import type { RecruitmentSourceRecord } from "./source";

let pool: Pool | null = null;

export function lakeConfigured() {
  return process.env.RECRUITMENT_SOURCE === "lake" && Boolean(process.env.RECRUITMENT_LAKE_DATABASE_URL);
}

function lakeDatabaseUrl() {
  const databaseUrl = process.env.RECRUITMENT_LAKE_DATABASE_URL;
  if (!databaseUrl) throw new Error("RECRUITMENT_LAKE_DATABASE_URL is not configured.");
  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");
  return url.toString();
}

function getLakePool() {
  if (!pool) {
    pool = new Pool({
      connectionString: lakeDatabaseUrl(),
      max: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await getLakePool().connect();
  try {
    await client.query("begin");
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function readLakeCandidates(): Promise<RecruitmentSourceRecord[]> {
  const result = await getLakePool().query<{
    local_id: string;
    airtable_record_id: string | null;
    fields: Record<string, unknown>;
    airtable_created_at: Date | string | null;
  }>("select local_id, airtable_record_id, fields, airtable_created_at from candidates where deleted_at is null");
  return result.rows.map((row) => ({
    id: row.airtable_record_id ?? row.local_id,
    createdTime: row.airtable_created_at instanceof Date ? row.airtable_created_at.toISOString() : row.airtable_created_at ?? "",
    fields: row.fields,
  }));
}

export async function writeLakeUpdate(id: string, patch: Record<string, unknown>) {
  await transaction(async (client) => {
    const updated = await client.query<{ local_id: string }>(
      "update candidates set fields = jsonb_strip_nulls(fields || $2::jsonb), updated_at = now() where airtable_record_id = $1 or local_id::text = $1 returning local_id",
      [id, JSON.stringify(patch)],
    );
    const localId = updated.rows[0]?.local_id;
    if (!localId) throw new Error(`Recruitment lake candidate ${id} was not found.`);
    await client.query(
      "insert into outbox (local_id, op, fields) values ($1, 'update', $2::jsonb)",
      [localId, JSON.stringify(patch)],
    );
  });
}

export async function writeLakeCreate(fields: Record<string, unknown>) {
  await transaction(async (client) => {
    const created = await client.query<{ local_id: string }>(
      "insert into candidates (fields) values (jsonb_strip_nulls($1::jsonb)) returning local_id",
      [JSON.stringify(fields)],
    );
    await client.query(
      "insert into outbox (local_id, op, fields) values ($1, 'create', $2::jsonb)",
      [created.rows[0].local_id, JSON.stringify(fields)],
    );
  });
}
