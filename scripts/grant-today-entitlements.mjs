// Grants Today (BM dashboard) entitlements in production: Pod Leads →
// admin role. Same pattern and pod-lead roster as Calltime's
// grant-booking-entitlements.mjs. Idempotent; people without a Cove user
// row (never signed in) are reported, not invented. Run:
//   DATABASE_URL=... node scripts/grant-today-entitlements.mjs

import { neon } from "@neondatabase/serverless";

const APP_ID = "47922bb0-9ad4-45b6-b18c-c62124ab9b0e"; // Today
const ROLE_ADMIN = "90fae018-ffbb-4d5d-ae8b-a9c3eaa1dd4a"; // Today Admin

const GRANTED_BY_EMAIL = "nicola@leatherbacktravel.com";

const POD_LEADS = [
  "olivia@caminowomen.com.au",
  "olivia@leatherbacktravel.com",
  "justin@patchadventures.com.au",
  "justin@leatherbacktravel.com",
  "courtney@patchadventures.com.au",
  "courtney@leatherbacktravel.com",
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
for (const row of results) console.log(`${row.label.padEnd(10)} ${row.email.padEnd(38)} ${row.result}`);
