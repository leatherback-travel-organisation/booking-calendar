// Applies pending db/*.sql migrations from PRODUCTION's own runtime, where
// DATABASE_URL always works — the laptop's route to Neon does not (443 to the
// serverless proxy times out on some networks), which stranded 045-047 for a
// day. Same tracking table, same statement splitter contract as
// scripts/migrate.mjs; runs on a cron and is idempotent, so a deploy carrying
// a new migration is live within the cron interval with no terminal step.

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Statement splitter matching scripts/migrate.mjs (comments, strings, $$). */
function splitStatements(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let dollarTag: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (!quote && !dollarTag && character === "-" && next === "-") {
      const end = source.indexOf("\n", index);
      if (end === -1) break;
      current += source.slice(index, end + 1);
      index = end;
      continue;
    }
    if (!quote && !dollarTag && character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Unclosed SQL block comment.");
      current += source.slice(index, end + 2);
      index = end + 1;
      continue;
    }
    if (!dollarTag && !quote && character === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        current += match[0];
        index += match[0].length - 1;
        continue;
      }
    } else if (dollarTag && character === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match && match[0] === dollarTag) {
        dollarTag = null;
        current += match[0];
        index += match[0].length - 1;
        continue;
      }
    }
    if (!dollarTag && (character === "'" || character === '"')) {
      if (!quote) quote = character;
      else if (quote === character) {
        if (next === character) {
          current += character + next;
          index += 1;
          continue;
        }
        quote = null;
      }
    }
    if (character === ";" && !quote && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "no DATABASE_URL" }, { status: 500 });
  const sql = neon(databaseUrl);

  await sql.query(
    `create table if not exists schema_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const directory = resolve(process.cwd(), "db");
  let filenames: string[];
  try {
    filenames = (await readdir(directory)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  } catch {
    return NextResponse.json({ error: "db directory not bundled" }, { status: 500 });
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const filename of filenames) {
    const done = await sql.query("select 1 from schema_migrations where filename = $1", [filename]);
    if ((done as unknown[]).length > 0) {
      skipped.push(filename);
      continue;
    }
    const source = await readFile(resolve(directory, filename), "utf8");
    const statements = splitStatements(source);
    await sql.transaction((tx) => [
      ...statements.map((statement) => tx.query(statement)),
      tx.query("insert into schema_migrations (filename) values ($1)", [filename]),
    ]);
    applied.push(filename);
  }

  return NextResponse.json({ ok: true, applied, pendingBefore: applied.length, total: filenames.length, skipped: skipped.length });
}
