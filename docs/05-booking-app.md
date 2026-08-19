# Calltime (Leatherback Booking)

Calendly replacement for Booking Managers, living inside Cove at
`cove.leatherbacktravel.com`. Guests book calls with the BM who actually
runs their trip; routing is derived live from Airtable's `Trip Coordinator`
field, so there are no routing rules to maintain and no checklist.

## The three rules

1. **Airtable is read-only. Always.** The app never writes to any Airtable
   base. Everything the app creates lives in the `booking` Postgres schema.
2. **No silent reassignment.** A guest who came to book with Claire is never
   quietly given to someone else. Fallback is always a visible choice the
   guest makes (ranked backups behind "Can't find a time that works?", or the
   honest brand pool).
3. **No bandaid ooze.** Calendars are treated as truth; discrepancies (leave
   approved in Toucan but calendar open, unreachable calendars, unresolvable
   trip slugs) are surfaced loudly on the coverage map, never papered over.

## Where things live

| Piece | Path |
|---|---|
| Migration (schema + app registration + seeds) | `db/037_booking_app.sql` |
| Availability engine (pure, DST-tested) | `src/lib/booking/availability/engine.ts` |
| Google delegation client (no SDK, node:crypto JWT) | `src/lib/booking/google/` |
| Routing resolution chain | `src/lib/booking/routing.ts` |
| Booking lifecycle (create/cancel/reschedule) | `src/lib/booking/service.ts` |
| Group sessions / BM invitations | `src/lib/booking/groups.ts`, `invitations.ts` |
| Reference sync (Airtable + Notion, read-only) | `src/lib/booking/reference/` |
| Notify stack (templates, .ics, Resend/Noop) | `src/lib/booking/notify/` |
| Admin UI | `src/app/booking/**` |
| Guest UI | `src/app/book`, `/manage/[token]`, `/invite/[token]`, `/session/[id]` |
| Widget | `src/app/embed.js`, `src/app/api/booking/widget`, `src/lib/booking/widget-script.ts` |
| Public APIs | `src/app/api/booking/public/*` |
| Crons | `/api/booking/cron/reminders` (*/5), `/api/booking/cron/sync-reference-data` (*/15) |

Phase 0 findings (verified Airtable schema, divergences from the original
brief, credential inventory) are in `DISCOVERY.md` at the Hackathon
workspace root.

## Security note — read before deploying

`GOOGLE_SA_KEY_B64` is a domain-wide-delegation service-account key that can
impersonate **any user in the Workspace** within its two scopes
(`calendar.readonly`, `calendar.events`). It is a high-value secret: Vercel
env vars only, server runtimes only, never logged, never `NEXT_PUBLIC_`.
Consider restricting the service account to a Workspace OU. The delegation
setup (admin console → API controls → Domain-wide delegation) must grant
exactly those two scopes — the code requests nothing broader.

Manage links are bearer credentials: 256-bit random tokens stored as SHA-256
digests (reminder emails use an HMAC-derived variant, `BOOKING_TOKEN_SECRET`).
Public endpoints carry honeypot + optional Turnstile + Postgres-backed rate
limits (10 req/min/IP, 3 bookings/hour/email).

## Launch runbook

1. `npm run db:migrate` (applies `037_booking_app.sql`; verified end-to-end
   against Postgres including the exclusion constraint).
2. Grant entitlements in Systems: role `admin` = Pod Lead, `user` = Booking
   Manager, app slug `booking`. Super admins were bootstrapped as Pod Leads.
3. Set env vars (see `.env.example`, booking section): `AIRTABLE_BOOKING_TOKEN`
   (fresh **read-only** PAT scoped to `appnRSV0g89whVidp` + `appYP9nVmzqan2PlU`
   — rotate the old ones), `NOTION_TOKEN`, `CRON_SECRET` (already set),
   `BOOKING_TOKEN_SECRET`.
4. Run the reference sync (Integrations → Run sync now, or wait for the cron).
   The coverage map at `/booking/routing` should populate immediately — this
   alone replaces the checklist.
5. Google: create the service account, enable delegation (two scopes), set
   `GOOGLE_SA_KEY_B64`, then Integrations → Test all calendars.
6. Email: verify per-brand sending domains in Resend (SPF + DKIM), set
   `RESEND_API_KEY` and `BOOKING_NOTIFIER=live`. Until then every email is
   rendered and stored in `booking.audit_log` (action
   `email_rendered_not_sent`) for inspection — nothing sends.
7. Help Scout creds (`HELPSCOUT_APP_ID/SECRET`) — until set, conversation
   creation is stubbed into the audit log. Mailbox IDs are seeded already.
8. Turnstile keys + `BOOKING_SLACK_WEBHOOK_URL` before public launch.
9. Widget: paste onto a trip page —
   `<script src="https://cove.leatherbacktravel.com/embed.js" data-brand="patch" defer></script>`

## Deliberately not built

SMS; leave in the availability engine (busy is busy — Toucan's leave blocks
arrive via Google free/busy, and the coverage map flags approved leave with
no calendar block); Airtable writes; round-robin distribution or booking
counters; a routing-rules engine; automatic BM substitution. See the build
brief §18 for the reasoning.

## Testing

- `node --experimental-strip-types --test src/lib/booking/**/*.test.mjs` —
  engine (19 cases incl. both hemispheres' DST), slug resolution, tokens,
  ics, templating, reference normalization, widget budget.
- Migration + constraint behaviour verified against real Postgres (PGlite):
  overlap → `23P01`, adjacency allowed, idempotency → `23505`, cancelled
  slots reusable, seat race admits exactly `capacity`.
- E2e: `BOOKING_E2E_BASE_URL=<preview> npx playwright test` (needs a
  deployed preview with a synced staff row).
