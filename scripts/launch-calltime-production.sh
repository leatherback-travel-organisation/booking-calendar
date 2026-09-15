#!/usr/bin/env bash
# Calltime production launch — the whole remaining sequence in one command.
# Prereqs: (1) nic-nov-lb has Write on cove-superpanel (Ceco/an org admin),
#          (2) Vercel CLI on PATH or VERCEL_BIN set, authenticated (nicola-2852).
#
#   bash scripts/launch-calltime-production.sh
#
# Steps: pull prod env → migrate DB (applies 037: schema, registration,
# brand colours, 210 templates) → add missing booking env vars → grant
# entitlements → push branch → deploy → verify.

set -euo pipefail
cd "$(dirname "$0")/.."

VERCEL_BIN="${VERCEL_BIN:-vercel}"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

echo "== 1/7 Pulling lbcove production env =="
mkdir -p .vercel
printf '{"orgId":"team_bCUUoKPj3tAnwhOT5OvDgQwM","projectId":"prj_4LYY66RXGjeRehe0mfheF5NkR10V","projectName":"lbcove"}\n' > .vercel/project.json
"$VERCEL_BIN" env pull "$SCRATCH/prod.env" --environment=production --yes

get_prod() { grep "^$1=" "$SCRATCH/prod.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
get_local() { grep "^$1=" .env.local | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

DATABASE_URL="$(get_prod DATABASE_URL)"
CRON_SECRET_PROD="$(get_prod CRON_SECRET)"
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL in prod env"; exit 1; }

echo "== 2/7 Applying pending migrations to production =="
DATABASE_URL="$DATABASE_URL" node scripts/migrate.mjs

echo "== 3/7 Adding missing booking env vars to production =="
add_var() { # add_var NAME VALUE
  if grep -q "^$1=" "$SCRATCH/prod.env"; then
    echo "   $1 already set — skipping"
  else
    printf '%s' "$2" | "$VERCEL_BIN" env add "$1" production
    echo "   $1 added"
  fi
}
for NAME in AIRTABLE_BOOKING_TOKEN AIRTABLE_BOOKING_BASE_ID GOOGLE_SA_KEY_B64 NOTION_TOKEN \
            AIRCALL_API_ID AIRCALL_API_TOKEN HELPSCOUT_APP_ID HELPSCOUT_APP_SECRET; do
  VALUE="$(get_local "$NAME")"
  [ -n "$VALUE" ] || { echo "   MISSING $NAME in .env.local"; exit 1; }
  add_var "$NAME" "$VALUE"
done
# Production gets its own token secret, never the dev one.
if ! grep -q "^BOOKING_TOKEN_SECRET=" "$SCRATCH/prod.env"; then
  add_var BOOKING_TOKEN_SECRET "$(openssl rand -base64 32)"
fi

echo "== 4/7 Granting entitlements (Pod Leads + BMs) =="
DATABASE_URL="$DATABASE_URL" node scripts/grant-booking-entitlements.mjs

echo "== 5/7 Pushing booking-app to the org GitHub source =="
# cove-superpanel when we have write there; booking-calendar (same org,
# shared history) otherwise — reconciled into cove-superpanel post-launch.
if git push origin booking-app 2>/dev/null; then
  DEPLOY_SOURCE_REMOTE=origin
else
  echo "   (cove-superpanel write pending — using booking-calendar)"
  git push booking-calendar booking-app
  DEPLOY_SOURCE_REMOTE=booking-calendar
fi

echo "== 6/7 Deploying production =="
# deploy-production.mjs spawns `vercel` by NAME, so VERCEL_BIN alone is not
# enough — without its directory on PATH the deploy dies with ENOENT after
# every earlier step has already run (hit 26 Aug).
VERCEL_DIR="$(cd "$(dirname "$VERCEL_BIN")" 2>/dev/null && pwd || true)"
[ -n "$VERCEL_DIR" ] && export PATH="$VERCEL_DIR:$PATH"
DEPLOY_SOURCE_REMOTE="$DEPLOY_SOURCE_REMOTE" npm run deploy:production

echo "== 7/7 Verifying =="
sleep 20
echo "-- reference sync --"
curl -sf -H "Authorization: Bearer $CRON_SECRET_PROD" \
  https://cove.leatherbacktravel.com/api/booking/cron/sync-reference-data \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('sync ok:',j.ok,'| failures:',(j.failures||[]).map(f=>f.source),'| staff:',j.counts.staffInserted+j.counts.staffUpdated)})"
echo "-- Janie's video toggle (launch exception) --"
DATABASE_URL="$DATABASE_URL" node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql\`update booking.staff set video_calls_enabled = true
    where email = 'janie@leatherbacktravel.com' returning full_name\`;
  console.log(rows.length ? 'video ON for ' + rows[0].full_name : 'Janie not in staff yet — rerun after first sync');
});"
echo "-- public resolve (janie-welsh) --"
curl -sf "https://cove.leatherbacktravel.com/api/booking/public/resolve?bm=janie-welsh" | head -c 200; echo
echo
echo "LAUNCH COMPLETE — open https://cove.leatherbacktravel.com/booking"
echo "Post-launch (not blocking): Resend + BOOKING_NOTIFIER=live, Turnstile,"
echo "Slack webhook, rotate Airtable PAT + Aircall key, toggle Janie's video ON"
echo "(Team → Janie → Offer video calls), test all calendars on Integrations."
