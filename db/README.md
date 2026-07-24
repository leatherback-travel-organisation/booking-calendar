# Cove access-control database

`001_access_control.sql` is the first production-oriented PostgreSQL schema for Cove and SuperPanel Admin. It intentionally contains no HR, leave, payroll, employee-document or personal-details features.

`008_github_organisation_paths.sql` moves the three registered application repository references to the company-owned `leatherback-travel-organisation` GitHub organisation without rewriting the historical seed migration.

`009` creates the operational `managed_assets` registry, `010` exposes the atomic Auth-to-Systems provisioning port, `011` makes SuperPanel a real entitlement-backed Cove application, and `012` registers its Vercel deployment in the systems inventory. `013` also clears the original placeholder repository reference from databases where `012` had already run. `017` adds the durable Cove SSO preparation, evidence, Admin approval and activation workflow without duplicating Auth & Access entitlements. `019` adds the durable `selected`/`all` employee-access policy: `all` grants current approved employees during registration and grants future invitees inside the Auth invitation transaction. `020` normalizes the universal Cove entry permission on existing canonical User/Admin roles while preserving their application-specific permissions. `021` repairs any completed application registration missing its Systems asset, `022` makes Money and Injury Reporting Evergreen employee services, and `025` removes Vercel hostnames from Cove's product directory in favour of the branded company domain. `028` relinks Toucan after its private repository is transferred into the company GitHub organisation. `029` makes the scalar/redacted audit-feed boundary a database constraint for every new event while retaining the append-only historical record. GitHub remains unset for an application until its private company repository actually exists.

## Boundaries

- Google Workspace or the selected OIDC provider proves an employee's identity.
- Verified partner login proves an external supplier's identity.
- SuperPanel owns teams, application roles and entitlements.
- Every participating application rechecks its own entitlement at the sensitive server boundary. Cove tiles and Next.js proxy redirects are not authorization controls.
- External-partner grants are scoped to one or more partner organisations. `all_partner_organisations` is for trusted employee roles only.
- Passwords, OAuth tokens, API keys and session cookies do not belong in this database.

## Safe deployment

1. Run migrations as a dedicated migration owner.
2. Give the application runtime role only the required `select`, `insert` and tightly scoped `update` permissions. It should not own these tables or the audit trigger.
3. Keep browser clients away from the database. Route Handlers or Server Actions must first verify the OIDC session and then call `requireEntitlement()` from `src/lib/access`.
4. Revoke access by setting `revoked_at` and increment a user's `session_version` when immediate suite-wide invalidation is needed.
5. Insert an audit event for login, denial, launch, grant, role change, expiry, revocation and emergency suspension. Audit metadata must be redacted before insertion.
6. Back up and retention-test the audit table separately. Its trigger prevents routine update/delete but does not replace database-role separation or an external immutable audit export.
7. Give every administrative mutation a fresh UUID request ID. The service claims it in `mutation_keys`, validates all target rows in the same statement, and writes a success audit only for an applied change; retries return an explicit duplicate outcome instead of duplicating grants or audit events.
8. Treat application metadata as a security boundary. Repository path/URL pairs must be complete and canonical, and the runtime validator must accept every application before registry data can authorize access or become a browser link.
9. Keep audit reads bounded and server-side. Cove validates the newest events and renders only redacted scalar metadata; nested payloads or secret-shaped keys make the live audit feed unavailable instead of leaking partial data.

## Preview data

The deterministic data in `src/lib/access/preview-data.ts` is synthetic and safe for UI development. It covers:

- an Operations employee with team-based TRTL and Supplier Portal access;
- an analyst with restricted Leatherback Answers access; and
- an external supplier restricted to its own organisation in Supplier Portal.

Never copy production emails, credentials, traveller data or Airtable tokens into preview seeds.
