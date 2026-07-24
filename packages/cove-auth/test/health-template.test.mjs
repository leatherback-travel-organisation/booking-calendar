import assert from "node:assert/strict";
import test from "node:test";
import { collectCoveAuthHealth, inspectCoveAuthConfiguration } from "../src/health.js";
import { buildCoveAuthTemplate } from "../src/template.js";
import { buildVendoredCoveAuthPackageFiles } from "../src/vendored.js";

const env = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_not_a_real_key",
  CLERK_SECRET_KEY: "sk_live_not_a_real_key",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "https://cove.leatherbacktravel.com/sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "https://cove.leatherbacktravel.com/sign-in",
  NEXT_PUBLIC_COVE_PRIMARY_URL: "https://cove.leatherbacktravel.com",
  COVE_PRIMARY_URL: "https://cove.leatherbacktravel.com",
  VERCEL_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
};

test("hygiene evidence is versioned, real and never includes secret values", async () => {
  const evidence = await collectCoveAuthHealth({
    application: { applicationSlug: "money" },
    env,
    fetch: async (url, init) => {
      assert.equal(url, "https://cove.leatherbacktravel.com/api/health");
      assert.equal(init.method, "GET");
      return Response.json({ status: "ok" });
    },
    now: () => new Date("2026-07-16T12:00:00.000Z"),
  });
  assert.equal(evidence.schema, "leatherback.cove-auth.health/v1");
  assert.equal(evidence.kitVersion, "1.1.0");
  assert.equal(evidence.provider, "cove");
  assert.equal(evidence.enforced, true);
  assert.deepEqual(evidence.application, { applicationSlug: "money" });
  assert.equal(evidence.deploymentCommitSha, env.VERCEL_GIT_COMMIT_SHA);
  assert.equal(evidence.status, "ready");
  assert.equal(JSON.stringify(evidence).includes(env.CLERK_SECRET_KEY), false);
  assert.ok(evidence.checks.every((check) => check.status === "pass"));
});

test("commit binding is omitted when the deployment does not provide a commit SHA", async () => {
  const withoutCommit = { ...env };
  delete withoutCommit.VERCEL_GIT_COMMIT_SHA;
  const evidence = await collectCoveAuthHealth({
    application: { applicationSlug: "money" },
    env: withoutCommit,
    fetch: async () => Response.json({ status: "ok" }),
  });
  assert.equal("deploymentCommitSha" in evidence, false);
});

test("missing runtime configuration produces precise failing checks", () => {
  const checks = inspectCoveAuthConfiguration({ application: { applicationSlug: "money" }, env: {} });
  assert.equal(checks.find((check) => check.id === "clerk_secret_key").status, "fail");
  assert.equal(checks.find((check) => check.id === "shared_parent_session").status, "pass");
  assert.equal(checks.find((check) => check.id === "canonical_access_api").status, "fail");
});

test("obsolete satellite variables fail health evidence", () => {
  const checks = inspectCoveAuthConfiguration({
    application: { applicationSlug: "money" },
    env: { ...env, NEXT_PUBLIC_CLERK_DOMAIN: "money.leatherbacktravel.com", NEXT_PUBLIC_CLERK_IS_SATELLITE: "true" },
  });
  assert.equal(checks.find((check) => check.id === "shared_parent_session").status, "fail");
});

test("invalid primary URL fails closed as evidence instead of crashing", async () => {
  const evidence = await collectCoveAuthHealth({
    application: { applicationSlug: "money" },
    env: { ...env, COVE_PRIMARY_URL: "not-a-url", NEXT_PUBLIC_COVE_PRIMARY_URL: "not-a-url" },
    fetch: async () => { throw new Error("must not run"); },
  });
  assert.equal(evidence.status, "needs_attention");
  assert.equal(evidence.checks.find((check) => check.id === "cove_primary_url").status, "fail");
  assert.equal(evidence.checks.find((check) => check.id === "cove_reachability").status, "fail");
});

test("pure template generator produces scanner route and reviewable merge inputs", () => {
  const template = buildCoveAuthTemplate({ sourceRoot: "src", applicationSlug: "money" });
  assert.equal(template.schema, "leatherback.cove-auth.template/v1");
  assert.deepEqual(template.application, { applicationSlug: "money" });
  assert.equal(template.packageJsonPatch.dependencies["@leatherback/cove-auth"], "file:packages/cove-auth");
  assert.ok(template.files.some((file) => file.path === "packages/cove-auth/package.json"));
  assert.ok(template.files.some((file) => file.path === "packages/cove-auth/src/server.js" && file.content.includes("authorization: `Bearer ${token}`")));
  assert.ok(template.files.some((file) => file.path === "src/app/.well-known/cove-access/route.ts"));
  assert.ok(template.files.some((file) => file.path === "src/proxy.ts" && file.mode === "create_or_merge"));
  assert.ok(template.patches.some((item) => item.path === "src/app/layout.tsx"));
  assert.equal(template.environmentVariables.find((item) => item.name === "NEXT_PUBLIC_COVE_PRIMARY_URL")?.value, "https://cove.leatherbacktravel.com");
  assert.equal(template.environmentVariables.find((item) => item.name === "NEXT_PUBLIC_CLERK_SIGN_UP_URL")?.required, true);
  assert.equal(JSON.stringify(template).includes("sk_live_"), false);
  assert.throws(() => buildCoveAuthTemplate({ sourceRoot: "../outside", applicationSlug: "money" }), /inside/);
  assert.throws(() => buildCoveAuthTemplate({ sourceRoot: "src", applicationId: "123e4567-e89b-42d3-a456-426614174000", applicationSlug: "money" }), /exactly one/);
});

test("vendored package file map is complete, versioned and locally installable", () => {
  const files = buildVendoredCoveAuthPackageFiles();
  const manifestFile = files.find((file) => file.path === "packages/cove-auth/package.json");
  const manifest = JSON.parse(manifestFile.content);
  assert.equal(manifest.name, "@leatherback/cove-auth");
  assert.equal(manifest.version, "1.1.0");
  assert.ok(files.some((file) => file.path === "packages/cove-auth/src/provider.js"));
  assert.ok(files.some((file) => file.path === "packages/cove-auth/src/proxy.js"));
  assert.ok(files.some((file) => file.path === "packages/cove-auth/src/health.d.ts"));
  assert.match(files.find((file) => file.path.endsWith("/provider.js")).content, /signUpUrl/);
  assert.doesNotMatch(files.find((file) => file.path.endsWith("/provider.js")).content, /isSatellite:\s*true/);
  assert.doesNotMatch(files.find((file) => file.path.endsWith("/proxy.js")).content, /satelliteAutoSync:\s*true/);
  assert.match(files.find((file) => file.path.endsWith("/proxy.js")).content, /\/__clerk\/\(\.\*\)/);
  assert.equal(files.every((file) => file.mode === "create" && typeof file.content === "string" && file.content.length > 0), true);
  assert.throws(() => buildVendoredCoveAuthPackageFiles({ targetRoot: "../outside" }), /inside/);
});
