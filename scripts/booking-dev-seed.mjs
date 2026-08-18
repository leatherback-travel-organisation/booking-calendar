// Builds the local demo database (.pglite-dev) for the booking app:
// stubs for the Cove tables the migration references (the demo access layer
// uses preview fixtures, not the DB), the real 037 migration, and a seed of
// real Booking Managers so trip routing against live Airtable data resolves.
// Run BEFORE starting the dev server (PGlite is single-connection):
//   node scripts/booking-dev-seed.mjs

import { rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const dir = `${process.cwd()}/.pglite-dev`;
rmSync(dir, { recursive: true, force: true });
const db = new PGlite(dir, { extensions: { btree_gist, citext, pgcrypto } });
await db.waitReady;

await db.exec(`
create extension if not exists pgcrypto;
create table if not exists applications (id uuid primary key, slug text unique, name text, description text,
  launch_url text, owner_name text, status text, risk text, allows_employees bool,
  allows_external_partners bool, updated_at timestamptz default now());
create table if not exists application_roles (id uuid primary key, application_id uuid, role_key text,
  name text, access_level text, allows_employees bool, allows_external_partners bool);
create table if not exists role_permissions (role_id uuid, permission text, unique(role_id, permission));
create table if not exists user_platform_roles (user_id uuid, role text, granted_by_user_id uuid,
  granted_at timestamptz default now(), revoked_at timestamptz);
create table if not exists entitlements (id uuid primary key default gen_random_uuid(), application_id uuid,
  role_id uuid, subject_type text, user_id uuid, granted_by_user_id uuid, revoked_at timestamptz);
`);

await db.exec(readFileSync(new URL("../db/037_booking_app.sql", import.meta.url), "utf8"));

const STAFF = [
  ["claire-jakobi", "claire@patchadventures.com.au", "Claire Jakobi", "Claire", "patch", "812169", "Claire has helped hundreds of guests find their perfect adventure across Asia and beyond."],
  ["tegan-weekley", "tegan@patchadventures.com.au", "Tegan Weekley", "Tegan", "patch", "884108", "Tegan knows the Patch trips inside out and loves matching guests to the right departure."],
  ["mandy-scanlon", "mandy@patchadventures.com.au", "Mandy Scanlon", "Mandy", "patch", "891660", "Mandy has travelled to over forty countries and still keeps a packed bag by the door."],
  ["pippa-chisholm", "pippa@caminowomen.com.au", "Pippa Chisholm", "Pippa", "camino-women", "837753", "Pippa walked her first Camino in 2019 and has been helping women hit the trail since."],
  ["sophie-stansfield", "sophie@caminowomen.com.au", "Sophie Stansfield", "Sophie", "camino-women", "793835", "Sophie leads our Camino Women community and knows every trail we walk."],
  ["donna-hawkins", "donna@magnificentrail.com.au", "Donna Hawkins", "Donna", "magnificent-explorers", "886559", "Donna is our rail expert — if it runs on tracks, she has probably ridden it."],
  ["annette-dickson", "annette@magnificentrail.com.au", "Annette Dickson", "Annette", "magnificent-explorers", "854037", "Annette plans rail adventures with the patience of someone who genuinely loves timetables."],
  ["louise-zacharia", "louise@fencox.com.au", "Louise Zacharia", "Louise", "fencox", "670830", "Louise has been crafting Fencox journeys for years and answers every question honestly."],
  ["jacqueline-lancaster", "jacqueline@carexdesign.com", "Jacqueline Lancaster", "Jacqueline", "carex", "823556", "Jacqueline lives among the gardens of Colombia and books our US garden tours."],
  ["janie-welsh", "janie@leatherbacktravel.com", "Janie Welsh", "Janie", "harriet", "899958", "Janie looks after the Harriet Adventures community from the United States."],
  ["nicola-noviello", "nicola@leatherbacktravel.com", "Nicola Noviello", "Nicola", "patch", "762406", "Nicola builds the systems behind Leatherback's trips - and takes the odd call too."],
];

import { existsSync } from "node:fs";
for (const [slug, email, fullName, firstName, brandKey, hsId, bio] of STAFF) {
  const photo = existsSync(`${process.cwd()}/public/demo-staff/${slug}.jpg`) ? `/demo-staff/${slug}.jpg` : null;
  const rows = await db.query(
    `insert into booking.staff (email, full_name, first_name, slug, primary_brand_id, helpscout_user_id, bio, photo_url)
     select $1, $2, $3, $4, b.id, $6, $7, $8 from booking.brand b where b.key = $5 returning id`,
    [email, fullName, firstName, slug, brandKey, hsId, bio, photo],
  );
  const staffId = rows.rows[0].id;
  await db.query(
    `insert into booking.staff_brand (staff_id, brand_id) select $1, id from booking.brand where key = $2`,
    [staffId, brandKey],
  );
  for (let day = 1; day <= 5; day += 1) {
    await db.query(
      `insert into booking.working_hours (staff_id, day_of_week, start_min, end_min) values ($1, $2, 540, 1020)`,
      [staffId, day],
    );
  }
}

// Jacqueline also serves Salt Caravan.
await db.exec(`
insert into booking.staff_brand (staff_id, brand_id)
select s.id, b.id from booking.staff s, booking.brand b
where s.slug = 'jacqueline-lancaster' and b.key = 'salt-caravan'
on conflict do nothing;
`);

const counts = await db.query(
  `select (select count(*) from booking.staff) staff, (select count(*) from booking.working_hours) wh`,
);
console.log("Demo database ready:", JSON.stringify(counts.rows[0]));
await db.close();
