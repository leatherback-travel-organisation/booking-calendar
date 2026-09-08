// Grants the Today (BM dashboard) USER entitlement to the 14 current
// Booking Managers in production, so the Cove tile launches into their own
// dashboard (SSO handoff). Companion to grant-today-entitlements.mjs (pod
// leads → admin). Idempotent; people without a Cove user row (never signed
// in) are reported, not invented. Run:
//   DATABASE_URL=... node scripts/grant-today-bm-entitlements.mjs

import { neon } from "@neondatabase/serverless";

const APP_ID = "47922bb0-9ad4-45b6-b18c-c62124ab9b0e"; // Today

const GRANTED_BY_EMAIL = "nicola@leatherbacktravel.com";

// The 14-BM roster as of Aug 2026 — matches the app's View-as dropdown
// (Airtable Booking Managers table, synced from the Notion Team Directory).
const BOOKING_MANAGERS = [
  "annette@magnificentrail.com.au",
  "carolyn@magnificentrail.com.au",
  "claire@patchadventures.com.au",
  "donna@magnificentrail.com.au",
  "farrah@patchadventures.com.au",
  "jacqueline@carexdesign.com",
  "janie@leatherbacktravel.com",
  "liane@leatherbacktravel.com",
  "louise@fencox.com.au",
  "mandy@patchadventures.com.au",
  "pippa@caminowomen.com.au",
  "sheona@caminowomen.com.au",
  "sophie@caminowomen.com.au",
  "tegan@patchadventures.com.au",
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const sql = neon(process.env.DATABASE_URL);

// Resolve the canonical User role for Today by name rather than hardcoding
// an id — fail loudly if the registry doesn't look as expected.
const roles = await sql`select id, name from roles where application_id = ${APP_ID}`;
const userRoles = roles.filter((r) => /user/i.test(r.name) && !/admin/i.test(r.name));
if (userRoles.length !== 1) {
  throw new Error(`Expected exactly one Today user role, found: ${roles.map((r) => r.name).join(", ") || "none"}`);
}
const ROLE_USER = userRoles[0].id;
console.log(`Role "${userRoles[0].name}" (${ROLE_USER})`);

async function userIdByEmail(email) {
  const rows = await sql`select id from users where lower(email) = ${email.toLowerCase()} and status = 'active'`;
  return rows[0]?.id ?? null;
}

const grantedBy = await userIdByEmail(GRANTED_BY_EMAIL);
if (!grantedBy) throw new Error(`Granting user ${GRANTED_BY_EMAIL} has no active Cove user row.`);

async function grant(email) {
  const userId = await userIdByEmail(email);
  if (!userId) return { email, result: "no Cove user (never signed in?)" };
  const existing = await sql`
    select 1 from entitlements
    where application_id = ${APP_ID} and role_id = ${ROLE_USER}
      and subject_type = 'user' and user_id = ${userId} and revoked_at is null`;
  if (existing.length) return { email, result: "already granted" };
  await sql`
    insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
    values (${APP_ID}, ${ROLE_USER}, 'user', ${userId}, ${grantedBy})`;
  return { email, result: "GRANTED" };
}

for (const email of BOOKING_MANAGERS) {
  const row = await grant(email);
  console.log(`${row.email.padEnd(38)} ${row.result}`);
}
