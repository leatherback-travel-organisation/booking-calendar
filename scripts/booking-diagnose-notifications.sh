#!/usr/bin/env bash
# READ-ONLY: why didn't a booking notify anyone? Asks PRODUCTION (which can
# always reach its own database — the laptop often cannot reach Neon) via the
# cron-secret-gated diagnostics endpoint, then pretty-prints.
set -euo pipefail
cd "$(dirname "$0")/.."
VERCEL_BIN="${VERCEL_BIN:-vercel}"
SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
mkdir -p .vercel
printf '{"orgId":"team_bCUUoKPj3tAnwhOT5OvDgQwM","projectId":"prj_4LYY66RXGjeRehe0mfheF5NkR10V","projectName":"lbcove"}\n' > .vercel/project.json
"$VERCEL_BIN" env pull "$SCRATCH/prod.env" --environment=production --yes >/dev/null
CRON_SECRET="$(grep '^CRON_SECRET=' "$SCRATCH/prod.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
curl -sf -H "Authorization: Bearer $CRON_SECRET" \
  "https://cove.leatherbacktravel.com/api/booking/cron/diagnose-notifications" \
  -o "$SCRATCH/diag.json"
node - "$SCRATCH/diag.json" <<'JS'
const fs = require("node:fs");
const { bookings, audit } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
console.log(`=== bookings in the last 24h (${bookings.length}) ===`);
for (const b of bookings) {
  console.log(`- ${b.created_at} ${b.guest_name} <${b.guest_email}> → ${b.bm} (${b.brand})`);
  console.log(`    source=${b.source_kind} bookedBy=${b.booked_by ?? "-"} status=${b.status}`);
  console.log(`    calendarEvent=${b.has_calendar_event} helpscout=${b.helpscout_conversation_id ?? "NONE"} phone=${b.guest_phone ?? "-"}`);
}
console.log(`\n=== notification audit rows (${audit.length}) ===`);
for (const a of audit) {
  const d = typeof a.detail === "string" ? a.detail : JSON.stringify(a.detail ?? {});
  console.log(`- ${a.created_at} [${a.action}] ${a.subject} :: ${d.slice(0, 200)}`);
}
JS
