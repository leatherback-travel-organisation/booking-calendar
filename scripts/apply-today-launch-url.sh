#!/usr/bin/env bash
# Apply ONLY the Today launch URL (db/042) to lbcove production.
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
  const before = await sql\`select launch_url from applications where slug = 'today'\`;
  if (!before.length) { console.log('No application with slug today'); process.exit(1); }
  console.log('before:', before[0].launch_url);
  await sql\`update applications set launch_url = 'https://leatherback-today.vercel.app/?key=e5b7e1ced2d8fd73330c542d394ed0e4', updated_at = now() where slug = 'today'\`;
  const after = await sql\`select launch_url from applications where slug = 'today'\`;
  console.log('after: ', after[0].launch_url);
});"
