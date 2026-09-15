// Dev datafix #2 (20 Aug 2026): per-BM video toggle, mirroring the in-place
// 037 edit. Video calls are OFF by default; Janie is the decided exception.
// Run with the dev server STOPPED (PGlite is single-connection):
//   node scripts/booking-dev-datafix-20260820b.mjs

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const db = new PGlite(`${process.cwd()}/.pglite-dev`, { extensions: { btree_gist, citext, pgcrypto } });
await db.waitReady;

await db.exec(`
alter table booking.staff add column if not exists video_calls_enabled boolean not null default false;
update booking.staff set video_calls_enabled = true where email = 'janie@leatherbacktravel.com';
`);

const rows = await db.query(
  "select full_name, video_calls_enabled from booking.staff where active order by full_name",
);
console.table(rows.rows.filter((r) => r.video_calls_enabled));
console.log("video ON for", rows.rows.filter((r) => r.video_calls_enabled).length, "of", rows.rows.length, "active staff");
await db.close();
