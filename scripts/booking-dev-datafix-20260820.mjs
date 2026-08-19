// One-off dev datafix (20 Aug 2026) aligning the existing .pglite-dev DB
// with the in-place edits to db/037_booking_app.sql (which production gets
// in one shot when 037 is applied):
//   - brand.sms_reminders_enabled  (per-brand SMS reminders toggle)
//   - staff.job_title              (replaces can_edit_communications)
//   - group sessions become Carex-only: lead-up group retired, Carex
//     pre-trip becomes the hour-long "Pre-Trip Video Call"
// Run with the dev server STOPPED (PGlite is single-connection):
//   node scripts/booking-dev-datafix-20260820.mjs

import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dir = `${process.cwd()}/.pglite-dev`;
const db = new PGlite(dir, { extensions: { btree_gist, citext, pgcrypto } });
await db.waitReady;

await db.exec(`
alter table booking.brand add column if not exists sms_reminders_enabled boolean not null default false;
alter table booking.staff add column if not exists job_title text;
alter table booking.staff drop column if exists can_edit_communications;

update booking.event_type set supports_group = false where key = 'lead-up';
update booking.event_type set supports_group = false
  where key = 'pre-trip'
    and brand_id <> (select id from booking.brand where key = 'carex');
update booking.event_type
   set name = 'Pre-Trip Video Call',
       description = 'An hour together on video before you travel — the full pre-trip run-through.',
       duration_min = 60,
       location_kind = 'google_meet'
 where key = 'pre-trip'
   and brand_id = (select id from booking.brand where key = 'carex');
`);

const brands = await db.query(
  "select key, sms_reminders_enabled from booking.brand order by key",
);
const carex = await db.query(
  `select et.key, et.name, et.duration_min, et.supports_group
   from booking.event_type et join booking.brand b on b.id = et.brand_id
   where b.key = 'carex' order by et.position`,
);
const groups = await db.query(
  "select count(*)::int as n from booking.event_type where supports_group",
);
console.log("brands:", brands.rows.length, "| group-capable event types:", groups.rows[0].n);
console.table(carex.rows);
await db.close();
