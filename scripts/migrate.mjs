import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Pull the linked Vercel environment first.");
}

const sql = neon(databaseUrl, {
  fetchOptions: { signal: AbortSignal.timeout(30_000) },
});

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

await sql.query(`
  create table if not exists schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )
`);

const migrationDirectory = resolve(process.cwd(), "db");
const filenames = (await readdir(migrationDirectory))
  .filter((filename) => /^\d+_.+\.sql$/.test(filename))
  .sort();

for (const filename of filenames) {
  const applied = await sql`select 1 from schema_migrations where filename = ${filename}`;
  if (applied.length) {
    process.stdout.write(`skip ${filename}\n`);
    continue;
  }

  const source = await readFile(resolve(migrationDirectory, filename), "utf8");
  const statements = splitStatements(source);
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement)),
    sql`insert into schema_migrations (filename) values (${filename})`,
  ]);
  process.stdout.write(`applied ${filename}\n`);
}
