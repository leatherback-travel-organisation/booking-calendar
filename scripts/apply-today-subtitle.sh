#!/usr/bin/env bash
# Apply ONLY the Today tile subtitle (db/042) to lbcove production.
# Deliberately does not run migrate.mjs, so Calltime's pending migrations
# stay untouched until that launch runs.
set -euo pipefail
cd "$(dirname "$0")/.."

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
# ~/.npm has root-owned cache entries (old sudo npm) — use a throwaway cache
export npm_config_cache="$SCRATCH/npm-cache"

mkdir -p .vercel
printf '{"orgId":"team_bCUUoKPj3tAnwhOT5OvDgQwM","projectId":"prj_4LYY66RXGjeRehe0mfheF5NkR10V","projectName":"lbcove"}\n' > .vercel/project.json

npx -y vercel env pull "$SCRATCH/prod.env" --environment=production --yes --scope leatherback-travel >/dev/null 2>&1
DATABASE_URL="$(grep '^DATABASE_URL=' "$SCRATCH/prod.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL in the pulled production env"; exit 1; }

DATABASE_URL="$DATABASE_URL" node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  const before = await sql\`select slug, name, owner_name from applications where slug = 'today'\`;
  if (!before.length) { console.log('No application with slug today — is it registered?'); process.exit(1); }
  console.log('before:', before[0].name, '|', before[0].owner_name);
  await sql\`update applications set owner_name = 'Booking Managers - Daily Overview', updated_at = now() where slug = 'today'\`;
  const after = await sql\`select name, owner_name from applications where slug = 'today'\`;
  console.log('after: ', after[0].name, '|', after[0].owner_name);
});"
