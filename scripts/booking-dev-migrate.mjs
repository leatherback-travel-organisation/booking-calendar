// Bring the LOCAL PGlite dev database (.pglite-dev) up to date with db/*.sql.
//
// Production migrates itself on a cron; the dev database had nothing doing the
// same, so it silently drifted behind the schema until a page died on a
// missing column. Run this after pulling new migrations:
//
//   node scripts/booking-dev-migrate.mjs                 # everything pending
//   node scripts/booking-dev-migrate.mjs 044 064          # just these
//
// A dev database restored from a snapshot has no migration history at all, so
// the full run tries to replay the schema from scratch and trips over what is
// already there. Naming the migrations you actually need is the way through.
//
// PGlite holds a single-process lock on the directory, so stop the dev server
// first. Local only — it never touches Neon.

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Statement splitting has to match scripts/migrate.mjs: dollar-quoted bodies
// and comments must not be cut at their semicolons.
function splitStatements(source) {
  const statements = [];
  let current = "";
  let quote = null;
  let dollarTag = null;

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

    if (!quote && character === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        if (!dollarTag) dollarTag = match[0];
        else if (dollarTag === match[0]) dollarTag = null;
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

const db = new PGlite(`${process.cwd()}/.pglite-dev`, {
  extensions: { btree_gist, citext, pgcrypto },
});
await db.waitReady;

await db.query(`
  create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )
`);

const migrationDirectory = resolve(process.cwd(), "db");
// Bare arguments select migrations by any part of the filename, so "064" and
// "064_staff_daily_call_cap.sql" both work.
const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const filenames = (await readdir(migrationDirectory))
  .filter((filename) => /^\d+_.+\.sql$/.test(filename))
  .filter((filename) => wanted.length === 0 || wanted.some((arg) => filename.includes(arg)))
  .sort();

if (wanted.length > 0 && filenames.length === 0) {
  process.stdout.write(`no migrations matched: ${wanted.join(", ")}\n`);
  process.exitCode = 1;
}

// A dev database restored from a snapshot carries the objects but not the
// schema_migrations rows, so every migration looks pending and the early ones
// fail on things that already exist. Locally that is noise, not danger: skip
// the statement, keep going, and let the schema converge on the files.
const ALREADY_THERE = /already exists|duplicate (column|object|key)/i;

let applied = 0;
let reconciled = 0;
for (const filename of filenames) {
  const seen = await db.query("select 1 from schema_migrations where filename = $1", [filename]);
  if (seen.rows.length) continue;

  let skipped = 0;
  let failure = null;
  const source = await readFile(resolve(migrationDirectory, filename), "utf8");
  for (const statement of splitStatements(source)) {
    try {
      await db.query(statement);
    } catch (error) {
      if (ALREADY_THERE.test(error.message)) {
        skipped += 1;
        continue;
      }
      failure = error;
      break;
    }
  }

  if (failure) {
    process.stdout.write(`FAILED  ${filename}: ${failure.message}\n`);
    process.exitCode = 1;
    break;
  }

  await db.query("insert into schema_migrations (filename) values ($1)", [filename]);
  if (skipped > 0) {
    process.stdout.write(`reconciled ${filename} (${skipped} statement(s) already present)\n`);
    reconciled += 1;
  } else {
    process.stdout.write(`applied ${filename}\n`);
    applied += 1;
  }
}

process.stdout.write(
  applied === 0 && reconciled === 0
    ? "already up to date\n"
    : `${applied} applied, ${reconciled} reconciled\n`,
);
await db.close();
