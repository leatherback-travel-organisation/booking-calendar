import { COVE_AUTH_VERSION, normalizeApplicationReference } from "./core.js";
import { buildVendoredCoveAuthPackageFiles } from "./vendored.js";

export function buildCoveAuthTemplate({ sourceRoot = "src", applicationId, applicationSlug, requestFileName = "proxy.ts" } = {}) {
  const root = normalizeSourceRoot(sourceRoot);
  const requestFile = normalizeRequestFileName(requestFileName);
  const application = normalizeApplicationReference({ applicationId, applicationSlug });
  const referenceExpression = "applicationId" in application
    ? `{ applicationId: ${JSON.stringify(application.applicationId)} }`
    : `{ applicationSlug: ${JSON.stringify(application.applicationSlug)} }`;
  const withRoot = (path) => root ? `${root}/${path}` : path;

  const files = [
    ...buildVendoredCoveAuthPackageFiles(),
    {
      path: withRoot("lib/cove-auth.ts"),
      mode: "create",
      content: `import { requireCoveAccess } from "@leatherback/cove-auth/server";\nimport type { CoveRole } from "@leatherback/cove-auth";\n\nexport const COVE_APPLICATION = ${referenceExpression} as const;\n\nexport function requireAppAccess(requiredRole: CoveRole = "user") {\n  return requireCoveAccess(COVE_APPLICATION, requiredRole);\n}\n`,
    },
    {
      path: withRoot("app/cove-auth-provider.tsx"),
      mode: "create",
      content: `import type { ReactNode } from "react";\nimport { CoveClerkProvider } from "@leatherback/cove-auth/provider";\n\nexport function CoveAuthProvider({ children }: { children: ReactNode }) {\n  return <CoveClerkProvider>{children}</CoveClerkProvider>;\n}\n`,
    },
    {
      path: withRoot(requestFile),
      mode: "create_or_merge",
      content: `import { COVE_PROXY_MATCHER, createCoveProxy } from "@leatherback/cove-auth/proxy";\n\nexport const proxy = createCoveProxy();\nexport default proxy;\n\nexport const config = { matcher: [...COVE_PROXY_MATCHER] };\n`,
    },
    {
      path: withRoot("app/.well-known/cove-access/route.ts"),
      mode: "create",
      content: `import { createCoveAuthHealthHandler } from "@leatherback/cove-auth/health";\nimport { COVE_APPLICATION } from "../../../lib/cove-auth";\n\nexport const dynamic = "force-dynamic";\nexport const GET = createCoveAuthHealthHandler({ application: COVE_APPLICATION });\n`,
    },
    {
      path: withRoot("app/api/cove-auth/health/route.ts"),
      mode: "optional",
      content: `export { dynamic, GET } from "../../../.well-known/cove-access/route";\n`,
    },
    {
      path: withRoot("app/api/protected-example/route.ts"),
      mode: "example",
      content: `import { withCoveRouteAccess } from "@leatherback/cove-auth/server";\nimport { COVE_APPLICATION } from "../../../lib/cove-auth";\n\nexport const GET = withCoveRouteAccess(COVE_APPLICATION, "user", async (_request, _context, access) => {\n  return Response.json({ userId: access.user.id, role: access.role });\n});\n`,
    },
    {
      path: withRoot("app/protected-example/actions.ts"),
      mode: "example",
      content: `"use server";\n\nimport { withCoveServerActionAccess } from "@leatherback/cove-auth/server";\nimport { COVE_APPLICATION } from "../../lib/cove-auth";\n\nexport const adminMutation = withCoveServerActionAccess(\n  COVE_APPLICATION,\n  "admin",\n  async (access, input: string) => ({ changedBy: access.user.id, input }),\n);\n`,
    },
  ];

  return {
    schema: "leatherback.cove-auth.template/v1",
    kitVersion: COVE_AUTH_VERSION,
    application,
    packageJsonPatch: {
      dependencies: { "@leatherback/cove-auth": "file:packages/cove-auth" },
    },
    environmentVariables: [
      { name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", visibility: "public", source: "Cove Clerk production instance", required: true },
      { name: "CLERK_SECRET_KEY", visibility: "secret", source: "Cove Clerk production instance", required: true },
      { name: "NEXT_PUBLIC_CLERK_SIGN_IN_URL", visibility: "public", source: "Cove primary sign-in URL", required: true },
      { name: "NEXT_PUBLIC_CLERK_SIGN_UP_URL", visibility: "public", source: "Cove primary sign-up URL", required: true },
      { name: "NEXT_PUBLIC_COVE_PRIMARY_URL", visibility: "public", value: "https://cove.leatherbacktravel.com", required: true },
      { name: "COVE_PRIMARY_URL", visibility: "server", value: "https://cove.leatherbacktravel.com", required: true },
      { name: "COVE_ACCESS_API_URL", visibility: "server", source: "Optional override; defaults to COVE_PRIMARY_URL/api/cove/access", required: false },
    ],
    files,
    patches: [
      {
        path: withRoot("app/layout.tsx"),
        strategy: "wrap_existing_children",
        import: `import { CoveAuthProvider } from "./cove-auth-provider";`,
        before: "{children}",
        after: "<CoveAuthProvider>{children}</CoveAuthProvider>",
        note: "Preserve existing metadata, fonts, providers and layout markup; wrap the existing application content once.",
      },
      {
        path: withRoot(requestFile),
        strategy: "merge_or_create",
        note: `If ${requestFile} already exists, compose its non-authentication logic with createCoveProxy instead of replacing it. Never rely on request middleware as the entitlement check.`,
      },
    ],
  };
}

function normalizeRequestFileName(value) {
  if (value !== "proxy.ts" && value !== "middleware.ts") {
    throw new TypeError("requestFileName must be proxy.ts or middleware.ts.");
  }
  return value;
}

function normalizeSourceRoot(sourceRoot) {
  if (typeof sourceRoot !== "string") throw new TypeError("sourceRoot must be a relative repository path.");
  const normalized = sourceRoot.trim().replace(/^\.\//, "").replace(/\/$/, "");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new TypeError("sourceRoot must remain inside the target repository.");
  }
  return normalized;
}
