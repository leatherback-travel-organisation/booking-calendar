import { createClerkClient } from "@clerk/backend";
import { neon } from "@neondatabase/serverless";
import { ensureClerkTeamUser } from "../src/lib/identity/clerk-provisioning.ts";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
const secretKey = process.env.CLERK_SECRET_KEY;

if (!databaseUrl || !secretKey) {
  throw new Error("DATABASE_URL and CLERK_SECRET_KEY are required.");
}

const sql = neon(databaseUrl);
const client = createClerkClient({ secretKey });
const approvedPeople = await sql`
  select distinct on (lower(users.email))
    users.display_name as name,
    lower(users.email) as email
  from users
  join user_invitations invitation
    on lower(invitation.email) = lower(users.email)
  where users.population = 'employee'
    and users.status = 'active'
    and invitation.status = 'pending'
    and (invitation.expires_at is null or invitation.expires_at > now())
  order by lower(users.email), invitation.invited_at desc
`;

let missing = 0;
let created = 0;

for (const person of approvedPeople) {
  const existing = await client.users.getUserList({
    emailAddress: [person.email],
    limit: 2,
  });
  if (existing.totalCount > 0) continue;

  missing += 1;
  if (!apply) continue;

  const result = await ensureClerkTeamUser(client, {
    name: person.name,
    email: person.email,
  });
  if (result.created) created += 1;
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  activePendingApprovals: approvedPeople.length,
  missingClerkAccounts: missing,
  createdClerkAccounts: created,
}, null, 2));
