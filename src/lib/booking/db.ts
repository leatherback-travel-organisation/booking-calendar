import "server-only";

import { databaseConfigured as neonConfigured, getSql as getNeonSql } from "@/lib/db/neon";

// Local demo database (PGlite, embedded Postgres) for development without a
// DATABASE_URL. Opt-in via BOOKING_DEV_PGLITE=true and hard-disabled in
// production — the canonical deployment always uses Neon.
function devPgliteEnabled(): boolean {
  return (
    process.env.BOOKING_DEV_PGLITE === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    process.env.NODE_ENV !== "production"
  );
}

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

type PgliteGlobal = typeof globalThis & {
  __bookingPglite?: { query(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
  __bookingPglitePromise?: Promise<unknown>;
};

function pgliteSql(): SqlTag {
  return async (strings, ...values) => {
    const g = globalThis as PgliteGlobal;
    if (!g.__bookingPglite) {
      if (!g.__bookingPglitePromise) {
        g.__bookingPglitePromise = (async () => {
          const [{ PGlite }, { btree_gist }, { citext }, { pgcrypto }] = await Promise.all([
            import("@electric-sql/pglite"),
            import("@electric-sql/pglite/contrib/btree_gist"),
            import("@electric-sql/pglite/contrib/citext"),
            import("@electric-sql/pglite/contrib/pgcrypto"),
          ]);
          const db = new PGlite(`${process.cwd()}/.pglite-dev`, {
            extensions: { btree_gist, citext, pgcrypto },
          });
          await db.waitReady;
          g.__bookingPglite = db as unknown as PgliteGlobal["__bookingPglite"];
        })();
      }
      await g.__bookingPglitePromise;
    }
    let text = "";
    strings.forEach((part, index) => {
      text += part;
      if (index < values.length) text += `$${index + 1}`;
    });
    const result = await g.__bookingPglite!.query(text, values as unknown[]);
    return result.rows;
  };
}

export function databaseConfigured(): boolean {
  return neonConfigured() || devPgliteEnabled();
}

export function getSql(): SqlTag {
  if (neonConfigured()) return getNeonSql() as unknown as SqlTag;
  if (devPgliteEnabled()) return pgliteSql();
  return getNeonSql() as unknown as SqlTag; // throws with the standard message
}
