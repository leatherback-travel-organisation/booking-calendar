# `@leatherback/cove-auth` 1.1.0

The supported Leatherback SSO and application-access kit for raw Next.js App Router applications using `@clerk/nextjs` 7. Cove and its `*.leatherbacktravel.com` Sub-Apps use one production Clerk instance and one shared parent-domain session.

This kit deliberately separates authentication from entitlement. Clerk establishes the shared person/session. Every protected page, Route Handler, API and Server Action must still call Cove’s canonical Auth & Access service on the server. Proxy protection alone is not sufficient.

## Install

For direct development, install the package from the Leatherback workspace or vendor this package directory unchanged:

```sh
npm install @leatherback/cove-auth@1.1.0 @clerk/nextjs@^7 next@^16 react@^19.2.4 react-dom@^19.2.4
```

Copy the names from `.env.example` into the Sub-App’s Vercel project. Real `CLERK_SECRET_KEY` values belong in Vercel and must never be committed. SuperPanel should provision or queue these values at the approval checkpoint.

Do not configure `NEXT_PUBLIC_CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_IS_SATELLITE`, `isSatellite`, `satelliteAutoSync`, or a `clerk.<app>` hostname. Those settings are for cross-site Clerk satellites and break Leatherback’s same-parent-domain applications.

## 1. Add the shared-session provider

Wrap the existing application content once. Preserve existing fonts, metadata and providers:

```tsx
// src/app/layout.tsx
import { CoveClerkProvider } from "@leatherback/cove-auth/provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><CoveClerkProvider>{children}</CoveClerkProvider></body>
    </html>
  );
}
```

`CoveClerkProvider` deliberately omits Clerk satellite options. A visitor who already has a Cove session is recognised through the shared `leatherbacktravel.com` session without a second sign-in.

## 2. Add Next.js 16 proxy protection

Place `proxy.ts` next to `app/` (`src/proxy.ts` when the project uses `src/app`):

```ts
import { COVE_PROXY_MATCHER, createCoveProxy } from "@leatherback/cove-auth/proxy";

export const proxy = createCoveProxy();
export default proxy;
export const config = { matcher: [...COVE_PROXY_MATCHER] };
```

For an application with deliberately public routes:

```ts
export const proxy = createCoveProxy({
  publicRoutes: ["/.well-known/cove-access(.*)", "/public(.*)"],
});
```

When a protected document is opened without a shared session, Clerk’s supported `redirectToSignIn({ returnBackUrl: request.url })` flow sends the visitor through Cove and returns to the exact original URL. No token or reusable credential is placed in the return URL.

## 3. Enforce canonical Cove access on the server

Use a canonical UUID or slug. A string is interpreted as a UUID only when it is a strict UUID; all other strings are slugs. Explicit references are clearest:

```ts
const application = { applicationId: "00000000-0000-4000-8000-000000000000" } as const;
// or: { applicationSlug: "supplier-portal" } as const
```

### Server Component/page

```tsx
import { CoveAccessState } from "@leatherback/cove-auth/components";
import { resolveCoveAccess } from "@leatherback/cove-auth/server";

export default async function Page() {
  const result = await resolveCoveAccess(application, "user");
  if (!result.ok) {
    return <CoveAccessState kind={result.error.kind} message={result.error.message} retryUrl="/" />;
  }
  return <main>{result.access.application.name}</main>;
}
```

Use `requireCoveAccess(application, "user")` when the route’s error boundary handles typed failures directly.

### Route Handler or sensitive API

```ts
import { withCoveRouteAccess } from "@leatherback/cove-auth/server";

export const POST = withCoveRouteAccess(application, "admin", async (request, _context, access) => {
  const input = await request.json();
  await performSensitiveMutation(input, access.user.id);
  return Response.json({ ok: true });
});
```

The wrapper returns safe JSON with HTTP 401, 403, 500 or 503 when access cannot be proved. It never performs the protected handler on failure.

### Server Action

```ts
"use server";
import { withCoveServerActionAccess } from "@leatherback/cove-auth/server";

export const changeSettings = withCoveServerActionAccess(
  application,
  "admin",
  async (access, input: SettingsInput) => saveSettings(input, access.user.id),
);
```

The access check runs inside every Server Action invocation, so a revoked or suspended person is denied even while an old Clerk browser session remains.

## Access protocol and role meaning

`requireCoveAccess()` obtains the current session token from Clerk on the server, then sends:

```http
POST https://cove.leatherbacktravel.com/api/cove/access
Authorization: Bearer <current Clerk session token>
Content-Type: application/json
```

The body is exactly one of:

```json
{"applicationId":"…","requiredRole":"user"}
```

```json
{"applicationSlug":"…","requiredRole":"admin"}
```

The token is never added to a query string, browser-visible secret or application claim. Cove evaluates the current User/Admin provision from canonical Auth & Access data on every call. `admin` satisfies `user`; `user` never satisfies `admin`.

Typed failures are:

- `CoveSignedOutError` (`authentication_required`, HTTP 401)
- `CoveUnauthorizedError` (`access_denied` or `role_required`, HTTP 403)
- `CoveConfigurationError` (`invalid_request` or `configuration_error`, HTTP 500)
- `CoveServiceUnavailableError` (`service_unavailable`, HTTP 503, retryable)

All failures are fail-closed.

## Sign-out

Use `CoveSuiteSignOutButton` from `@leatherback/cove-auth/components`. It uses Clerk’s supported sign-out operation, which revokes the shared Clerk session, and redirects to Cove. Do not merely clear an application cookie.

## Health and hygiene evidence

Expose the canonical scanner endpoint:

```ts
// src/app/.well-known/cove-access/route.ts
import { createCoveAuthHealthHandler } from "@leatherback/cove-auth/health";

export const dynamic = "force-dynamic";
export const GET = createCoveAuthHealthHandler({ application });
```

The response is versioned as `leatherback.cove-auth.health/v1`. It reports `provider: "cove"`, `enforced: true`, the canonical application reference, the deployed `VERCEL_GIT_COMMIT_SHA` when Vercel provides one, real configuration checks, and a live request to Cove’s production health endpoint. It never returns secret values or fabricated evidence. SuperPanel must bind this evidence to the approved application/commit and still run repository/build tests and signed-in entitlement probes before marking an integration Active.

## SuperPanel preparation API

`buildCoveAuthTemplate({ sourceRoot, applicationId, applicationSlug })` is a pure file-map generator. It returns dependency/env patches, new file contents, and merge instructions without filesystem access. The prepared PR contains the complete versioned runtime kit under `packages/cove-auth`, and the target application dependency is `file:packages/cove-auth`; no private registry publication is required for checks or deployment:

```ts
import { buildCoveAuthTemplate } from "@leatherback/cove-auth/template";

const prepared = buildCoveAuthTemplate({
  sourceRoot: "src",
  applicationSlug: "supplier-portal",
});
```

Automation that only needs the local package payload can call `buildVendoredCoveAuthPackageFiles({ targetRoot: "packages/cove-auth" })` from `@leatherback/cove-auth/vendored`. It returns `package.json`, JavaScript modules and TypeScript declarations entirely from in-memory strings—there are no filesystem reads or network calls.

Automation must treat `create_or_merge` and `patches` entries as reviewable patch inputs. Existing proxy/layout content must be merged, not overwritten. Do not merge or deploy generated changes before explicit Admin approval.

## Verification

Run the package’s dependency-free tests:

```sh
npm test --prefix packages/cove-auth
```

Production activation additionally requires evidence for: primary Google sign-in, no second sign-in from Cove, direct signed-out return-to, already-signed-in shared-session access, User/Admin distinction, revoked access rejection, sensitive API rejection, suite logout and the `/.well-known/cove-access` response.
