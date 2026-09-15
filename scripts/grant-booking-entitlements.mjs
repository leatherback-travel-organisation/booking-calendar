// Grants Calltime entitlements in production: Pod Leads → admin role,
// Booking Managers → user role. Idempotent — existing active entitlements
// are left alone; people without a Cove user row yet (never signed in) are
// reported, not invented. Run with DATABASE_URL set:
//   DATABASE_URL=... node scripts/grant-booking-entitlements.mjs

import { neon } from "@neondatabase/serverless";

const APP_ID = "7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01";
const ROLE_ADMIN = "2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03"; // Pod Lead
const ROLE_USER = "9b40cf1e-5f0a-4f5b-9a34-6d1f2fb0aa02"; // Booking Manager

const GRANTED_BY_EMAIL = "nicola@leatherbacktravel.com";

const POD_LEADS = [
  "nicola@leatherbacktravel.com",
  "olivia@caminowomen.com.au",
  "justin@patchadventures.com.au",
  "justin@leatherbacktravel.com",
  "courtney@patchadventures.com.au",
  "courtney@leatherbacktravel.com",
];

const BOOKING_MANAGERS = [
  "claire@patchadventures.com.au",
  "jacqueline@carexdesign.com",
  "pippa@caminowomen.com.au",
  "sheona@caminowomen.com.au",
  "annette@magnificentrail.com.au",
  "farrah@patchadventures.com.au",
  "liane@leatherbacktravel.com",
  "tegan@patchadventures.com.au",
  "donna@magnificentrail.com.au",
  "carolyn@magnificentrail.com.au",
  "janie@leatherbacktravel.com",
  "mandy@patchadventures.com.au",
  "sophie@caminowomen.com.au",
  "louise@fencox.com.au",
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const sql = neon(process.env.DATABASE_URL);

async function userIdByEmail(email) {
  const rows = await sql`select id from users where lower(email) = ${email.toLowerCase()} and status = 'active'`;
  return rows[0]?.id ?? null;
}

const grantedBy = await userIdByEmail(GRANTED_BY_EMAIL);
if (!grantedBy) throw new Error(`Granting user ${GRANTED_BY_EMAIL} has no active Cove user row.`);

async function grant(email, roleId, label) {
  const userId = await userIdByEmail(email);
  if (!userId) return { email, label, result: "no Cove user (never signed in?)" };
  const existing = await sql`
    select 1 from entitlements
    where application_id = ${APP_ID} and role_id = ${roleId}
      and subject_type = 'user' and user_id = ${userId} and revoked_at is null`;
  if (existing.length) return { email, label, result: "already granted" };
  await sql`
    insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
    values (${APP_ID}, ${roleId}, 'user', ${userId}, ${grantedBy})`;
  return { email, label, result: "GRANTED" };
}

const results = [];
for (const email of POD_LEADS) results.push(await grant(email, ROLE_ADMIN, "Pod Lead"));
for (const email of BOOKING_MANAGERS) results.push(await grant(email, ROLE_USER, "Booking Manager"));

for (const row of results) console.log(`${row.label.padEnd(16)} ${row.email.padEnd(38)} ${row.result}`);
const missing = results.filter((row) => row.result.startsWith("no Cove user"));
if (missing.length) {
  console.log(`\n${missing.length} people have no Cove account yet — they get access automatically`);
  console.log("once invited/signed in and re-running this script (or via Cove Systems UI).");
}
