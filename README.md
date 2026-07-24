# SuperPanel

SuperPanel is Leatherback Travel's shared control plane for independently deployed applications. Its employee-facing home is called **Cove**.

It will provide:

- Cove, an employee home showing the applications each person can access;
- central authentication through Leatherback's Google Workspace;
- simple access administration inside SuperPanel rather than Google Groups or the Google Admin console;
- a Cove Admin Panel for general people and per-application access;
- a separate, systems-team-only SuperPanel for GitHub, Vercel, application and website registries, publishing guidance, and automated hygiene;
- a safe developer-access workflow for human developers and coding agents; and
- a CTO Agent workflow for specification review, implementation planning, and pull-request review.

Individual applications remain separate GitHub repositories and Vercel projects. SuperPanel centralises discovery, identity, authorisation policy, and oversight without becoming a single monolithic application.

## Runtime architecture

- Clerk verifies Google identity. A Google login alone does not grant Cove access.
- Neon Postgres stores the allowlist, invitations, users, platform roles, per-app User/Admin grants, and append-only audit events.
- SuperPanel and the employee applications are registered centrally. SuperPanel is a genuine entitlement-backed Sub-App shown only to the systems team; its `/systems` route still rechecks the platform role independently.
- Airtable remains the operational source for the People, Brands, Money, and Injury modules. Live failures return an honest unavailable state; production never substitutes synthetic people or records.
- Local development and Vercel previews can short-circuit People and Brands to synthetic snapshots before any configured Airtable connection is read, matching the same isolation already enforced by Money and Injury. Vercel production always uses Clerk and live services; it cannot enter demonstration mode from an environment flag. Live GitHub telemetry is also dormant in demonstration mode.
- Brand links, logos, directory emails, and directory dates cross a fail-closed source-integrity boundary before rendering. Unsafe or malformed optional fields are omitted and counted visibly; incomplete rows are never given invented names, roles, teams, or contact details.
- Money and Injury source rows are validated before they reach totals, review controls, or report history. Rows with unverifiable workflow state, currency, amount, dates, required report detail, or attachment targets are omitted and counted visibly instead of receiving fallback operational values.
- Every sensitive server action re-checks both Cove membership and the application permission at execution time.
- Access-admin mutations use one-time request IDs, resolve their user, application, and role targets inside the same database statement, and append success audits only when state actually changes.
- Every access write revalidates that its actor is still an active administrator inside the mutation statement. Super-admin accounts cannot be suspended through the ordinary Cove access screen.
- Invitation acceptance locks and consumes one pending allowlist record atomically; an identity-provider subject already bound to another user cannot be rebound by an email change.
- Systems operations use an explicit read-only telemetry boundary. On every SuperPanel load, Cove discovers the repositories visible in `COVE_GITHUB_ORG` (default `leatherback-travel-organisation`) and fetches registered-asset metadata and check runs. These GET-only requests use the configured Cove GitHub App installation, or a dedicated `COVE_GITHUB_READ_TOKEN` fallback; missing or failed integrations remain visibly unavailable and never produce inferred health.
- Existing applications and websites are registered separately with a product owner, working team, sensitivity, production URL, and optional private GitHub repository. Applications appear in Cove only for people with an actual User or Admin entitlement; websites never enter the application-access registry.
- SuperPanel performs hygiene checks from evidence rather than asking an administrator to attest manually. Application checks cover ownership, private source, protected branch, CI, secret scanning, CODEOWNERS, README/runbook, production health, and a Cove SSO handshake. Website checks replace the SSO check with production HTML foundations, search metadata, robots.txt, and sitemap.xml.
- A beginner can register an existing Vercel application before its source is connected. Publishing then uses one named contributor's GitHub identity: a systems owner creates the private company repository and scopes access, while Claude Code or Codex verifies and pushes from the complete project folder. There are no source ZIPs, shared credentials or organisation-owner tokens.
- Application registry rows are validated before they can authorize access or render browser links. Launch targets must be credential-free HTTPS URLs, GitHub paths and URLs must match, and malformed or empty registries fail health readiness closed.
- The complete authorization snapshot crosses a second fail-closed boundary. Invalid identities, users, roles, permissions, memberships, grant windows, scopes, or cross-record references make live access unavailable instead of being coerced into a usable grant. A minimal catalog of every user preserves valid pre-auth invitation grants while rejecting orphaned platform roles, memberships, entitlements, and grant provenance. Readiness reports this separately as `accessPolicy`.
- The People administration directory crosses its own fail-closed boundary before mutation controls render. User IDs, populations, statuses, invitation history, roles, timestamps, and application provisions must agree with the registered applications. Expired and revoked identity-binding windows stay visible and can be renewed explicitly; external partners can never receive Cove platform administration. Readiness reports this as `accessDirectory`.
- SuperPanel Admin exposes the newest 100 append-only access events through a read-only audit view. Event IDs, references, timestamps, outcomes, targets, and redacted scalar metadata are validated before rendering; nested values and secret-shaped metadata fields fail the feed closed. Demonstration mode uses synthetic events only, and readiness reports the live boundary separately as `accessAudit`.

Run `npm run db:migrate` after linking the Vercel environment. Run `npm run check` before deployment; it runs ESLint, the integrity test suite, TypeScript checking through the production build, and the Next.js production build.

## Quality and accessibility gates

`.github/workflows/quality.yml` runs `npm ci` and `npm run check` for every push and pull request with read-only repository permissions. The application shell also exposes a keyboard skip link, visible focus indicators, current-page semantics, and programmatic state for filters, favourites, selectable records, and access-level controls. Responsive navigation accounts for mobile safe areas.

The systems-only SuperPanel reads GitHub server-side with request caching disabled, so a fresh organisation inventory is requested on every page load or manual refresh. Configure `COVE_GITHUB_ORG=leatherback-travel-organisation` and the Cove GitHub App installation credentials. A dedicated fine-grained `COVE_GITHUB_READ_TOKEN` restricted to read-only repository metadata and checks remains supported as a fallback. Credentials and short-lived installation tokens are never sent to the browser. Vercel deployment telemetry remains a separate, explicitly unconfigured provider until its project mapping and credential policy are approved.

## Production deployment

Run `npm run deploy:production` from this directory. It always targets the
`leatherback-travel/lbcove` Vercel project, pins the organization and project
IDs, repairs a missing or stale local project link, and moves
`https://lbcove.vercel.app/` to the completed production deployment.

Do not use a bare `vercel --prod` command for this project because it relies on
local `.vercel` metadata that may be missing or left over from the former
`ck-travel` project name.

## Your Money

The `/money` sub-app gives each employee a private view of their invoices,
travel credits, and reimbursements. `/admin/money` adds the role-protected
Finance queue for users assigned Money Admin. Synthetic records are used only
in explicit demonstration mode; live environments show an unavailable state
when the `AIRTABLE_MONEY_*` connection is incomplete.

Airtable reads are server-side only, and employee requests are matched to an
immutable Team Member link or verified email. Reviews reload the authoritative
record, reject stale edits, and enforce controlled status transitions. Writes
remain disabled by default; verify the base's field names before enabling them.
Inbound Money and Injury records also fail closed per row: Cove reports how many
source rows were omitted and never turns malformed fields into actionable
statuses, invented dates, zero-day injury answers, or unsafe attachment links.

## Current documents

- [Initial security audit](docs/01-security-audit.md)
- [Target architecture](docs/02-target-architecture.md)
- [Implementation roadmap](docs/03-implementation-roadmap.md)
- [Cove visual design system handoff](docs/04-cove-design-system.md)

## Current status

The first three reviewed applications are `leatherback-travel-organisation/leatherback-supplier-portal-v2`, `leatherback-travel-organisation/trtl`, and `leatherback-travel-organisation/leatherback-answers`. The immediate priorities are building Cove and SuperPanel Admin, replacing legacy login patterns, closing TRTL's confirmed record-authorisation gap, restricting Leatherback Answers to an explicit analyst/admin entitlement, and supporting both employee and external-partner identity in the Supplier Portal.
