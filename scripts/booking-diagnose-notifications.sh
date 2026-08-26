#!/usr/bin/env bash
# READ-ONLY: why didn't a booking notify anyone? Prints the last day's
# bookings and every notification-related audit row. Same env-pull pattern
# as launch-calltime-production.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL_BIN="${VERCEL_BIN:-vercel}"
SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
mkdir -p .vercel
printf '{"orgId":"team_bCUUoKPj3tAnwhOT5OvDgQwM","projectId":"prj_4LYY66RXGjeRehe0mfheF5NkR10V","projectName":"lbcove"}\n' > .vercel/project.json
"$VERCEL_BIN" env pull "$SCRATCH/prod.env" --environment=production --yes >/dev/null
DATABASE_URL="$(grep '^DATABASE_URL=' "$SCRATCH/prod.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
DATABASE_URL="$DATABASE_URL" node - <<'JS'
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
console.log("=== bookings in the last 24h ===");
for (const b of await sql`
  select b.id, b.created_at, b.guest_name, b.guest_email, b.source_kind, b.booked_by,
         b.helpscout_conversation_id, b.google_event_id is not null as has_cal_event,
         s.full_name as bm, br.name as brand
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.brand br on br.id = b.brand_id
   where b.created_at > now() - interval '24 hours'
   order by b.created_at desc`) {
  console.log(`- ${b.created_at.toISOString()} ${b.guest_name} → ${b.bm} (${b.brand})`);
  console.log(`    source=${b.source_kind} bookedBy=${b.booked_by ?? "-"} calEvent=${b.has_cal_event} hsConversation=${b.helpscout_conversation_id ?? "NONE"}`);
}
console.log("\n=== notification audit rows, last 24h ===");
for (const a of await sql`
  select created_at, action, subject, detail
    from booking.audit_log
   where created_at > now() - interval '24 hours'
     and (action in ('email_rendered_not_sent','sms_rendered_not_sent','helpscout_stubbed','ops_alert')
          or action like '%fail%' or subject like '%helpscout%' or subject like '%email%')
   order by created_at desc limit 40`) {
  const d = typeof a.detail === "string" ? a.detail : JSON.stringify(a.detail ?? {});
  console.log(`- ${a.created_at.toISOString()} [${a.action}] ${a.subject} ${d.slice(0, 160)}`);
}
JS
