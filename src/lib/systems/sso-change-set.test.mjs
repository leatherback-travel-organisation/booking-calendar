import assert from "node:assert/strict";
import test from "node:test";
import { buildCoveAuthChangeSet } from "./sso-change-set.ts";

const base = {
  applicationId: "44afdbef-d010-4282-a44d-cb13cc1cd742",
  applicationSlug: "supplier-reporting",
  source: {
    packageJson: JSON.stringify({ name: "supplier-reporting", dependencies: { next: "16.2.10" } }),
    packageLockJson: null,
    sourceRoot: "src",
    layoutPath: "src/app/layout.tsx",
    layout: "export default function Layout({ children }) { return <html><body>{children}</body></html>; }",
    proxyPath: "src/proxy.ts",
    proxy: null,
  },
};

test("prepares a versioned vendorable kit, provider wrapper, health route, and proxy", () => {
  const changeSet = buildCoveAuthChangeSet(base);
  assert.match(changeSet.files["package.json"], /file:packages\/cove-auth/);
  assert.match(changeSet.files["src/app/layout.tsx"], /CoveAuthProvider/);
  assert.match(changeSet.files["src/proxy.ts"], /createCoveProxy/);
  assert.match(changeSet.files["src/app\/.well-known/cove-access/route.ts"], /createCoveAuthHealthHandler/);
  assert.equal(changeSet.manualAction, undefined);
});

test("updates npm lockfile metadata for the vendored kit", () => {
  const packageLockJson = JSON.stringify({
    name: "supplier-reporting",
    lockfileVersion: 3,
    packages: { "": { name: "supplier-reporting", dependencies: { next: "16.2.10" } } },
  });
  const changeSet = buildCoveAuthChangeSet({ ...base, source: { ...base.source, packageLockJson } });
  const lock = JSON.parse(changeSet.files["package-lock.json"]);
  assert.equal(lock.packages[""].dependencies["@leatherback/cove-auth"], "file:packages/cove-auth");
  assert.deepEqual(lock.packages["node_modules/@leatherback/cove-auth"], { resolved: "packages/cove-auth", link: true });
  assert.equal(lock.packages["packages/cove-auth"].peerDependencies.next, ">=15.5.9 <17");
});

test("does not overwrite an existing proxy it cannot safely compose", () => {
  const changeSet = buildCoveAuthChangeSet({ ...base, source: { ...base.source, proxy: "export function proxy() { return legacyRouting(); }" } });
  assert.equal(changeSet.files["src/proxy.ts"], undefined);
  assert.match(changeSet.manualAction, /Matthew must review/);
  assert.match(changeSet.files["COVE_AUTH_PROXY_REVIEW.md"], /satelliteAutoSync/);
});

test("uses middleware.ts for a Next.js 15 application", () => {
  const changeSet = buildCoveAuthChangeSet({
    ...base,
    source: {
      ...base.source,
      packageJson: JSON.stringify({ name: "supplier-reporting", dependencies: { next: "15.5.20" } }),
      proxyPath: "src/middleware.ts",
    },
  });
  assert.match(changeSet.files["src/middleware.ts"], /createCoveProxy/);
  assert.equal(changeSet.files["src/proxy.ts"], undefined);
});
