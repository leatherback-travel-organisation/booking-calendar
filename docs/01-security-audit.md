# Initial Security Audit

Date: 14 July 2026
Status: Initial read-only review
Applications reviewed: `leatherback-travel-organisation/leatherback-supplier-portal-v2`, `leatherback-travel-organisation/trtl`, and `leatherback-travel-organisation/leatherback-answers`

This is a first-pass assessment based on repository metadata and selected source files available through the connected GitHub account. It is not yet a complete penetration test or a review of Vercel environment-variable values, Airtable token scopes, access logs, or every API route.

## Executive finding

All three reviewed applications have material authentication or authorisation work before they should become templates for SuperPanel. The supplier portal accepts an email address without proving mailbox ownership. TRTL commits real-user passwords to source and exposes a sensitive bookings API to any signed-in user without applying the user's role or brand scope. Leatherback Answers also commits passwords and gives every configured user unrestricted natural-language access to the mirrored booking base.

This must be remediated before the application is used as the template for SuperPanel authentication.

## Findings

### Critical — TRTL commits real-user passwords to the repository

`src/lib/users.ts` contains plaintext credentials for dozens of current users. A shared test credential is also documented in the README. The repository is private, but every collaborator, clone, AI integration, backup, and retained Git object with access to the repository can read those credentials.

Required action:

- Treat every committed TRTL password as compromised and rotate or disable it.
- Replace the password list with Google Workspace SSO before adding more users.
- Remove the credentials from the current tree and purge them from Git history after a coordinated cutover.
- Search for password reuse across other internal tools without collecting or transmitting employees' passwords.
- Remove the example credential from documentation.

### Critical — TRTL's bookings API does not enforce the user's assigned scope

The user registry contains roles and brand assignments, but `src/app/api/bookings/route.ts` does not read the signed-in user or apply either value. It returns fields including passport, medical, contact, travel, visa, and supplier notes. The middleware proves only that a caller has a valid session; it does not determine which booking records that caller may access.

Impact:

Any configured TRTL user can call the API directly and request booking data outside their assigned brand or role, regardless of what the interface happens to display.

Required action:

- Add server-side authorisation to every sensitive route, based on a centrally defined entitlement and record scope.
- Default to no data when the user or scope cannot be resolved.
- Add automated cross-user tests proving that one brand or Booking Manager cannot retrieve another's restricted records.
- Review every TRTL API route for the same middleware-only pattern.

### Critical — Leatherback Answers commits application passwords

`lib/users.ts` contains plaintext passwords for the application's configured users. Because Leatherback Answers can query a broad mirror of the bookings base, possession of one of these credentials provides unusually wide access.

Required action:

- Disable or rotate the committed passwords and replace the login with Google Workspace SSO.
- Remove the credentials from the current tree and purge them from Git history after cutover.
- Keep Leatherback Answers restricted to a small, explicit admin/analyst entitlement until field- and table-level access rules exist.

### High — Leatherback Answers has no data-level authorisation boundary

The application mirrors broad Airtable tables to SQLite and allows the model to query them. Authentication is enforced at the application proxy, but `app/api/ask/route.ts` does not independently verify a user or role, and the query layer has no per-user table, field, or row restrictions.

Impact:

Every configured user can ask for information from any mirrored table, including customer and operational data. Adding ordinary employees to the current user list would silently grant them the same analytical access as an administrator.

Required action:

- Make the application admin/analyst-only in the initial SuperPanel registry.
- Verify identity and entitlement again inside the sensitive API route.
- Define an allow-list of permitted tables and fields, with explicit treatment of customer PII.
- Log the user, question, tables accessed, model used, and export volume without logging sensitive answer content by default.
- Add output and abuse controls before broadening access.

### Medium — Required signing and cron secrets are not validated explicitly

TRTL and Leatherback Answers pass environment values directly into their signing helpers. When `AUTH_SECRET` is absent, session creation fails at runtime rather than failing deployment with a clear configuration error. TRTL's public cron route also compares against an interpolated `CRON_SECRET` without first rejecting a missing value.

Required action:

- Validate required environment variables at startup/build time and fail closed with a clear operational error.
- Require independently generated secrets of suitable length in every environment.
- In the backup route, reject immediately when `CRON_SECRET` is absent before comparing the authorisation header.
- Rotate these secrets during the SSO migration.

### Critical — Email knowledge is sufficient to sign in

Remediation status: Draft pull request opened on 14 July 2026: [leatherback-travel-organisation/leatherback-supplier-portal-v2#1](https://github.com/leatherback-travel-organisation/leatherback-supplier-portal-v2/pull/1). The change replaces legacy cookies with Clerk-verified identity while retaining Airtable as the supplier entitlement check. It is not yet deployed; Clerk must first be connected to the Vercel project.

Evidence:

- `app/login/page.tsx` submits only an email address.
- `app/api/auth/route.ts` calls `resolveSupplierScope(email)` and creates a session when the email exists.
- There is no password, Google verification, one-time code, magic link, or other proof of mailbox ownership.

Impact:

Anyone who learns or guesses a registered supplier email can create a valid 30-day session and access the data assigned to that supplier. Supplier email addresses are likely discoverable through ordinary business communications and public websites.

Required action:

- Replace email-only login with verified authentication.
- For Leatherback employees, use Google Workspace SSO restricted to the Leatherback Workspace.
- For external suppliers, use a verified magic link or one-time code, with optional Google or Microsoft sign-in.
- Continue mapping the verified email identity to the supplier access records in Airtable during the migration.
- Invalidate all existing legacy sessions when the new authentication flow is released.

### High — GitHub ownership uses a personal account rather than an organisation

Remediation status on 15 July 2026: the active TRTL, Leatherback Answers and Supplier Portal repositories were transferred to the company-owned `leatherback-travel-organisation` GitHub organisation. The remaining governance work is to require two-factor authentication, add a second trusted owner, grant developer access through teams and apply protected-branch rulesets.

The API identifies `leatherbacktravel` as a GitHub `User`, not an `Organization`.

Impact:

- Repository ownership and recovery are tied to one account.
- Team-based permissions, offboarding, organisation-wide rulesets, and audit administration are harder to manage consistently.
- A compromised owner account has an unusually large blast radius.

Required action:

- Create a proper Leatherback Travel GitHub Organisation.
- Require two-factor authentication.
- Add at least two trusted owners.
- Transfer active repositories into it.
- Give staff access through teams rather than shared credentials or direct ad-hoc grants.
- Apply organisation rulesets to require pull requests, checks, and independent review for production branches.

### High — Vercel projects are not yet consolidated under the company team

The connected Vercel team `LEATHERBACK TRAVEL` currently exposes only the `stitch-ops` project. The supplier portal is not visible within that team through the connected account.

Impact:

- Production applications may be owned by personal Vercel accounts.
- Offboarding, billing, environment-variable access, deployment protection, and incident response may be fragmented.
- SuperPanel Admin cannot reliably inventory or observe all applications.

Required action:

- Inventory every live Vercel project and its owner.
- Transfer company applications into the canonical Leatherback Vercel team.
- Restrict project membership by responsibility.
- Enable deployment protection for preview and generated deployment URLs.
- Record production domains, repositories, data sources, and owners in the SuperPanel app registry.

### High — A public AI application has no application-level authentication

`leatherbacktravel/matgpt` is public and contains a non-empty Express application. The checked source did not contain a committed Anthropic key, which is good. However, its `/api/check` endpoint has no authentication or rate limiting and calls the Anthropic API using a server-side key.

Impact if deployed publicly:

- Anyone can consume Leatherback's Anthropic allowance.
- Automated requests could create unexpected cost or service exhaustion.
- Submitted documents are processed by the service without an explicit employee access boundary.

Required action:

- Confirm whether the repository and any deployment are intentionally public.
- If it is an employee tool, make the repository private and require Google Workspace login.
- Add durable server-side rate limits, request-size controls, and usage logging.
- Upgrade or review dependencies flagged by automated dependency scanning.

### Medium — Session signing is coupled to the Airtable credential

`lib/session.ts` prefers `SESSION_SECRET` but falls back to `AIRTABLE_TOKEN`, and finally to a known development string.

Impact:

- A missing `SESSION_SECRET` unnecessarily couples authentication security to the Airtable credential.
- Credential rotation and incident containment become harder.
- A known fallback is unsafe if a misconfigured environment ever serves functioning routes without the intended secrets.

Required action:

- Require a dedicated session secret and fail closed when it is absent.
- Do not use data-access tokens as cryptographic signing keys.
- Rotate the session secret during the authentication migration.

### Medium — Current rate limiting is not durable

The login route tracks attempts in an in-memory map inside each serverless instance.

Impact:

Requests spread across instances or redeployments do not share a counter, making the limit unsuitable as the main defence against enumeration or abuse.

Required action:

Use an identity-provider limit plus a shared edge or durable rate limiter. Return a generic response that does not reveal whether an email exists.

### Medium — Sensitive Airtable access needs a separate scope review

The application reads extensive traveller PII directly from Airtable using a server-side personal access token. The token's precise scopes and base access have not yet been inspected.

Required action:

- Confirm least-privilege base and record scopes.
- Separate read and write credentials where practical.
- Remove the old-portal write relay after direct scoped writes are working.
- Audit attachment download paths and confirm that every route rechecks the authenticated supplier scope.
- Define retention, export, and logging rules for passport and medical data.

## Positive controls already present

- The supplier portal repository is private.
- Airtable tokens remain server-side.
- Data queries are scoped through the supplier mapping.
- Write fields and values are explicitly allow-listed.
- Record writes are intended to be checked against the signed-in supplier's trips.
- Session cookies are HTTP-only, secure in production, and HMAC signed.
- Security headers prevent indexing, framing, MIME sniffing, and referrer leakage.
- Environment files and Vercel local metadata are ignored by Git.

These are worth preserving, but they do not compensate for the missing proof of identity at login.

## Repository baseline for monitoring

Repositories visible on 14 July 2026:

| Repository | Visibility | Initial state |
| --- | --- | --- |
| `data-dashboard-test` | Private | Empty |
| `leatherback-dashboard` | Private | Populated |
| `matgpt` | Public | Populated |
| `leatherback-supplier-portal` | Private | Populated |
| `leatherback-supplier-portal-v2` | Private | Populated |
| `leatherback-answers` | Private | Populated and reviewed |
| `trtl` | Private | Populated and reviewed; latest checked commit deployed successfully by Vercel |

An hourly read-only monitor is active through the evening of 14 July 2026 to report newly visible repositories or the remaining empty repository becoming populated.

## Audit work still required

- Full repository tree and API-route authorisation review.
- GitHub collaborators, owner recovery, branch rules, Actions permissions, secret scanning, and dependency alerts.
- Vercel ownership, project settings, generated URLs, deployment protection, environment-variable metadata, domains, and logs.
- Airtable personal access token scopes and base sharing.
- Live authentication and horizontal-access testing with safe test accounts.
- Inventory of old deployments and write relays that should be retired.
