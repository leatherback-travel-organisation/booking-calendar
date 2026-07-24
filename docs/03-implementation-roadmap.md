# Implementation Roadmap

## Phase 0 — Contain current risk

1. Replace the supplier portal's email-only login with verified authentication. Implementation is in draft PR #1; Clerk/Vercel configuration and live verification remain.
2. Move TRTL and Leatherback Answers from source-controlled passwords to Google Workspace SSO; rotate/disable the committed credentials and then purge them from Git history.
3. Add server-side record authorisation to every TRTL API route. The first confirmed gap is `/api/bookings`, which currently ignores the user's role and brand scope while returning sensitive traveller fields.
4. Keep Leatherback Answers admin/analyst-only and add route-level entitlement plus table/field restrictions before expanding its audience.
5. Validate `AUTH_SECRET`, `CRON_SECRET`, Airtable credentials, and model credentials explicitly; deployments must fail clearly when required configuration is missing.
6. Invalidate existing legacy sessions and require dedicated session secrets.
7. Accept `matgpt` as an explicitly recorded public-risk exception for now; protect the AI endpoint before any wider or paid use.
8. Complete governance for the new `leatherback-travel-organisation` GitHub organisation: require two-factor authentication, add a second trusted owner, use teams for developer access, and apply protected-branch rulesets. The active TRTL, Leatherback Answers and Supplier Portal repositories were transferred on 15 July 2026.
9. Inventory and transfer company Vercel projects into the `LEATHERBACK TRAVEL` team.
10. Enable preview/generated-deployment protection and basic GitHub security controls.

Exit condition: no known application relies on email knowledge or repository-stored passwords, and every sensitive API enforces the caller's server-side entitlement and record scope.

## Phase 1 — Establish the platform contract

1. Choose the identity platform using a two-application Google Workspace SSO and external magic-link spike. Prove prompt-free navigation from Home to both independently deployed applications, local and suite-wide logout, suspension, and entitlement revocation.
2. Define user, application, role, entitlement, and audit-event schemas.
3. Define SuperPanel-managed teams and the admin grant/revoke workflow. Google Groups must not be an application-access dependency.
4. Register a separate OIDC client and strict callback allow list for Home and each pilot application, with separate development, preview, and production configuration.
5. Define repository, Vercel project, environment, stable subdomain, ownership, and naming standards.
6. Create the shared SuperPanel integration package and application starter, including login, callback, local session, entitlement, revocation, logout, and audit helpers.
7. Establish protected pull-request and preview-deployment workflows.

Exit condition: a new app can join the suite with central SSO, its own secure session, permissions, revocation, auditing, and preview deployment without inventing those pieces again.

## Phase 2 — Build one vertical slice

Build:

- Cove, the tropical-cove-themed employee application home;
- a minimal SuperPanel Admin;
- Google Workspace employee login;
- one employee-only reference app;
- central app registration and entitlement checks;
- one audit-event feed;
- an admin screen for direct, team-based, and expiring access grants; and
- one access-request and approval flow.

The supplier portal can inform the integration contract but should not be the only pilot because it serves external users with a different login policy.

Its employee access path is part of the initial application-integration wave. Its external-partner access path follows the separate partner policy while sharing the same server-side permission system.

Exit condition: one employee can sign in once, see only an authorised app, open it without another credential prompt, and have access and significant actions recorded.

The vertical-slice test must begin with no application sessions, establish the Home session through Google, launch both reference applications, and verify that each creates a host-only local session through the central SSO redirect. It must also prove that removing one entitlement denies only that application and that “sign out everywhere” prevents all three sessions from being reused.

## Phase 3 — Add external partner identity

1. Integrate the remediated supplier portal.
2. Add verified magic-link or one-time-code authentication.
3. Model partner organisations and supplier administrators.
4. Add invitations, expiry, revocation, and supplier access audits.
5. Retire legacy session and relay mechanisms.

## Phase 4 — Add operational administration

1. Application health, deployment status, and ownership views.
2. Central audit search and alerting.
3. Access reviews and inactive-user reports.
4. Developer access packs with short-lived credentials.
5. Incident and emergency-revocation workflows.

## Phase 5 — Introduce the CTO Agent

Start read-only:

1. Review specifications against the agreed template.
2. Review pull requests and preview evidence.
3. Produce security, testing, and architecture findings.
4. Record recommendations in SuperPanel Admin.

Only after the review workflow is trusted should worker-agent orchestration be enabled. Human approval remains mandatory for merges and production releases.

## Migration order

Score each application by:

- sensitivity of its data;
- weakness of its current authentication;
- number of users;
- operational importance;
- Stacker/Airtable cost avoided;
- implementation complexity; and
- readiness of its source repository and Vercel ownership.

Migrate the highest-risk, reasonably tractable applications first. Do not retire an Airtable or Stacker interface until data correctness, access, exports, and rollback have been verified.

For each application migration:

1. Assign its stable application identifier, owner, production domain, and identity client.
2. Integrate the shared package and remove any email-knowledge, shared-secret, or hand-built login flow.
3. Map existing users to immutable central identity IDs and import entitlements.
4. Test direct navigation, launch from Home, expired sessions, revoked access, logout, and unavailable-control-plane behaviour.
5. Invalidate legacy sessions at cutover and monitor login, denial, and entitlement events.

## Inputs still needed

- Any additional application repositories as they are created.
- Inventory of live Vercel projects and their current owners.
- The Airtable bases corresponding to each application.
- A first-pass employee team list and application ownership list.
- One employee-only app to use alongside the supplier portal as the vertical-slice reference.
