# Target Architecture

## Architectural position

SuperPanel is a control plane, not a super-app.

Operational applications remain independently owned, developed, deployed, and rolled back. SuperPanel provides shared identity, application discovery, permissions, audit events, health, and developer governance.

## Identity populations

Leatherback has two materially different user populations and should not force them through the same login policy.

### Employees

- Authenticate through Leatherback's Google Workspace.
- Only managed Leatherback Workspace identities may enter employee applications.
- Google Workspace proves identity only; Google Groups and the Google Admin console do not grant application access.
- Admins grant, revoke, and review application access in SuperPanel Admin.
- SuperPanel may read basic Workspace directory information to help admins find employees and detect suspended accounts, but it does not push entitlement administration into Google.

### External suppliers and partners

- Authenticate with a verified magic link or one-time code.
- Optionally support Google and Microsoft sign-in where the verified identity email matches an invited account.
- Map each verified identity to a partner organisation and permitted records.
- Never treat knowledge of a registered email address as authentication.

The Supplier Portal serves both populations. Leatherback employees enter it from Cove using their verified Workspace identity and a SuperPanel employee entitlement. External suppliers use the partner identity policy and remain scoped to their supplier organisation and permitted trips. Employees must not share or borrow supplier accounts.

A single identity platform may serve both populations, but it must apply separate policies and claims.

## Application stitching and single sign-on

SuperPanel should make the applications feel like one suite without turning them into one deployment or weakening their security boundaries.

### Domain and identity shape

Use one central identity tenant and a stable authentication domain, for example `auth.leatherbacktravel.com`. Give each production application its own registered OIDC client, or the provider's equivalent isolated application registration, plus a stable SuperPanel application identifier. Production applications should ultimately use company-controlled subdomains such as `panel.leatherbacktravel.com` and `<app>.leatherbacktravel.com`.

Vercel-provided URLs are suitable for development and the identity spike. Stable company-controlled domains are required before an application is treated as a production member of the suite because callback registration, cookie scope, incident response, and provider migration all depend on durable origins.

The identity record must be keyed by the provider's immutable subject identifier, not by email address. Email remains a verified contact and matching attribute, because it can change. For employee Google login, the identity layer must validate [Google's Workspace `hd` claim](https://developers.google.com/identity/openid-connect/reference) and verified-email state; an email suffix or the `hd` request hint alone is not sufficient enforcement.

### Launch and session flow

1. An employee signs in to SuperPanel Home through the central identity service using Leatherback Google Workspace.
2. Home displays only applications for which the employee has an active SuperPanel entitlement.
3. When the employee opens an application, that application checks its own server-side session.
4. If no valid local session exists, the application redirects to the central identity service using the OIDC authorisation-code flow with PKCE, a nonce, and a one-time, browser-session-bound `state` value containing only an allow-listed return target.
5. The central identity service reuses its existing SSO session. In the normal case, the employee is returned immediately without another Google prompt.
6. The application exchanges the one-time code on the server, validates the issuer, audience, signature, expiry, nonce, and employee policy, then creates its own short-lived, HTTP-only, secure session cookie.
7. Before granting access, the application validates its application-specific entitlement with SuperPanel. Sensitive actions recheck the relevant permission rather than relying only on the menu tile or an old token claim.
8. The application records login, denial, logout, and significant business actions using the common user and application identifiers.

This is redirect-based SSO, not a cookie shared among all applications. Authentication cookies remain host-only wherever possible. Identity tokens, access tokens, and SuperPanel entitlements must never be put in launch URLs or browser-readable storage.

### Session and revocation rules

- Each application owns its local session and can remain independently deployable.
- The central identity service owns the SSO session and Google connection.
- SuperPanel owns application entitlement and revocation state.
- Applications use short session lifetimes and revalidate entitlement on a bounded interval; high-risk actions perform a fresh check.
- Local sign-out ends the current application's session. “Sign out everywhere” ends the central SSO session and revokes or invalidates participating application sessions.
- Disabling a user or entitlement must take effect without waiting for a long-lived identity token to expire. The shared package should support a session-version or revocation check and an emergency fail-closed mode.
- An unavailable control plane must not silently grant new access. Each application needs an explicit, risk-based policy for briefly using a previously verified entitlement versus failing closed.

The authorization loader keeps identity-bound users separate from a minimal reference catalog of all user records. This permits an invited person to receive roles, team membership, or application access before first authentication, while still failing readiness if any authorization edge or grantor points to a user that does not exist.

The access-administration directory is validated independently before it can render mutation controls. Unknown user or invitation states, malformed IDs and timestamps, unregistered application provisions, contradictory identity/invitation history, and external-partner platform roles fail closed. Expired or revoked employee invitations are shown honestly and require an explicit renewal to open a new binding window.

### Shared integration package

The SuperPanel package should expose the same small server-side contract in every repository:

- `requireIdentity()` validates or establishes the application's local session;
- `requireEntitlement(applicationId, permission)` checks current access;
- `startLogin(returnTo)` creates the protected OIDC redirect;
- `handleCallback()` validates the response and issues the local session;
- `signOut(scope)` supports local or suite-wide sign-out; and
- `emitAuditEvent()` records security and business events.

The package should hide provider-specific SDK details from applications. This makes an identity-provider change possible without rewriting every app, while application code continues to enforce its own business permissions.

### Identity-platform selection gate

The Clerk/Auth0 spike must test the real multi-application flow, not only whether Google login works in one demo:

- one Google Workspace login across Home and two separately deployed applications;
- company-domain and Vercel preview callback handling with strict allow lists;
- server-side session validation in the application frameworks actually in use;
- verified Workspace-domain enforcement;
- separate employee and external-partner policies;
- local logout, suite-wide logout, entitlement revocation, and user suspension;
- audit export, MFA and step-up options, administration, pricing, and recovery; and
- behaviour when the identity service or SuperPanel entitlement API is unavailable.

[Auth0's central Universal Login](https://auth0.com/docs/authenticate/single-sign-on) is the baseline candidate because cross-application, cross-domain SSO is a first-class tenant capability. Clerk remains a candidate, but its [satellite-domain approach](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains) and supported framework/plan constraints must pass the two-application spike. A plain social-login integration that merely creates unrelated sessions in each app does not meet the SuperPanel requirement.

## Deployment model

Each production application has:

- a separate repository in the Leatherback GitHub Organisation;
- a separate Vercel project in the Leatherback Vercel team;
- an assigned product owner and technical owner;
- independent preview and production deployments;
- its own data boundary and least-privilege service credentials; and
- the shared SuperPanel integration package.

Vercel-provided URLs are acceptable during the initial build and identity spike. Attach stable subdomains under `leatherbacktravel.com` before each application becomes a production member of the suite.

## SuperPanel components

### Cove (employee home)

Cove lists applications for which the signed-in employee has an active entitlement. A tile contains the application name, description, owner, icon, environment status, and launch URL. Cove uses a refined tropical-cove visual identity while remaining an application launcher rather than an HR portal or general-purpose intranet.

Cove is not a security boundary. Each target application must validate the user and permission again on the server.

Cove does not include personal-details management, leave, payroll, performance reviews, employee documents, or other HR functions in the current scope.

### Admin

SuperPanel Admin manages:

- applications and their owners;
- users, teams, roles, and entitlements;
- access requests, approvals, expiry, and revocation;
- application health and recent deployments;
- security and business audit events;
- developer access packs; and
- CTO Agent recommendations and exceptions.

Access administration must be designed for ordinary operational admins, not Google Workspace specialists. An admin can search for an employee, select one or more applications and roles, optionally set an expiry date, and grant access in one flow. App admins may manage only their assigned applications; super admins may manage the full suite. Bulk grants happen through SuperPanel-managed teams, and every grant, change, approval, expiry, and revocation produces an audit event.

The first audit surface is deliberately read-only and bounded to the newest 100 events. It resolves actor and application labels server-side, validates all references and displayable metadata, and withholds the entire feed when an event cannot be trusted. Secret-shaped fields, nested payloads, raw identity subjects, and token-like values are never browser presentation data. The database trigger remains the append-only control; a future immutable external export is still required for long-term retention and incident recovery.

Google account suspension should block employee authentication, but Google Groups are neither an entitlement source nor a required administration workflow. Optional directory synchronisation is for employee discovery, profile updates, and offboarding signals only.

### Control-plane data

The initial model should contain:

- `User`
- `Team` (managed inside SuperPanel)
- `Application`
- `Role`
- `Entitlement`
- `AccessRequest`
- `AuditEvent`
- `Environment`
- `DeveloperGrant`
- `AgentReview`

Existing Airtable user lists can seed the first entitlement import. Airtable should not remain the long-term source of truth for SuperPanel identity and access.

### Shared application contract

Every participating app integrates a small versioned package that provides:

- OIDC login, callback, local-session, and logout handling;
- authentication/session verification;
- permission checks;
- audit-event emission;
- consistent user and application identifiers;
- health and build metadata; and
- standard error and access-denied behaviour.

The package should be small enough to upgrade independently across repositories.

## Developer access broker

SuperPanel should issue developer access packs rather than permanent shared keys.

An access pack may contain:

- GitHub team or repository access;
- a development or preview environment;
- anonymised or seeded test data;
- short-lived, scoped service credentials;
- approved tool endpoints and setup instructions;
- expiry and revocation metadata; and
- a complete audit trail.

Coding agents must not receive unrestricted production database, Airtable, Vercel, or identity-provider credentials.

## CTO Agent

The CTO Agent is an advisory and review control, not an autonomous production owner.

Workflow:

1. A product specification defines the problem, users, permissions, data, risks, acceptance criteria, and rollout.
2. The CTO Agent reviews the specification and records questions or recommendations.
3. An orchestrator decomposes an approved specification into independently testable slices.
4. Worker agents implement slices on branches.
5. Separate reviewer agents inspect correctness, tests, security, and architectural consistency.
6. Automated checks and a Vercel preview validate the integrated result.
7. A human approves merge and production promotion.

Guardrails:

- no direct production credentials;
- no self-approval of its own changes;
- no production deployment authority;
- every recommendation linked to evidence;
- exceptions recorded and time limited; and
- human ownership remains explicit.

## Initial authorisation model

Start with a small, understandable model:

- `super_admin`: manages the platform and all entitlements;
- `app_admin`: manages one application's access and operational settings;
- `member`: uses an application;
- `viewer`: read-only access where the application supports it;
- `developer`: access to development resources, not automatically to production data.

Applications may add business-specific roles, but platform roles should remain consistent.

## Key decisions still open

- Identity platform selection after a short Clerk/Auth0 implementation spike.
- Control-plane database and hosting choice.
- Audit-event retention and sensitive-field redaction rules.
- Whether employee directory discovery is a live Google Directory lookup or a periodic read-only synchronisation.
- Regional and legal requirements for traveller PII.
