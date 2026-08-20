#!/usr/bin/env bash
# Apply ONLY db/042 (Today tile subtitle) to lbcove production.
# Deliberately does not run migrate.mjs, so Calltime's pending 037-041
# stay untouched until that launch runs.
set -euo pipefail
cd "$(dirname "$0")/.."

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# ~/.npm has root-owned cache entries (old sudo npm) — use a throwaway cache
export npm_config_cache="$SCRATCH/npm-cache"

npx -y vercel env pull "$SCRATCH/prod.env" --environment=production --yes >/dev/null
DATABASE_URL="$(grep '^DATABASE_URL=' "$SCRATCH/prod.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
[ -n "$DATABASE_URL" ] || { echo "No DATABASE_URL in prod env"; exit 1; }

DATABASE_URL="$DATABASE_URL" node --input-type=module -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const before = await sql\`select slug, name, owner_name from applications where slug = 'today'\`;
console.log('before:', before);
await sql\`update applications set owner_name = 'Booking Managers - Daily Overview', updated_at = now() where slug = 'today'\`;
const after = await sql\`select slug, name, owner_name from applications where slug = 'today'\`;
console.log('after:', after);
"
echo "Done — reload cove.leatherbacktravel.com to see the new subtitle."
