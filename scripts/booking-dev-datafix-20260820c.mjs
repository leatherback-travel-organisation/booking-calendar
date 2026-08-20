// Dev datafix #3 (20 Aug 2026): the "Quick Chat" event type — the guest
// portal's default (15-minute 1:1) — mirroring the 037 seed addition.
// Run with the dev server STOPPED:
//   node scripts/booking-dev-datafix-20260820c.mjs

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const db = new PGlite(`${process.cwd()}/.pglite-dev`, { extensions: { btree_gist, citext, pgcrypto } });
await db.waitReady;

await db.exec(`
insert into booking.event_type (brand_id, key, name, description, duration_min, guest_facing, supports_group, position)
select b.id, 'chat', 'Quick Chat',
       'A quick 15-minute chat about your trip — whatever''s on your mind.',
       15, true, false, 5
from booking.brand b
on conflict (brand_id, key) do nothing;
`);

const rows = await db.query(
  `select b.key as brand, et.name, et.duration_min from booking.event_type et
   join booking.brand b on b.id = et.brand_id where et.key = 'chat' order by b.key`,
);
console.table(rows.rows);
await db.close();
