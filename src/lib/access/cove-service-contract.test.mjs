import assert from "node:assert/strict";
import test from "node:test";
import {
  accessLevelForGrant,
  coveAccessRequestSchema,
  grantSatisfiesRequiredRole,
  permissionNamespace,
  resolveCanonicalApplication,
} from "./cove-service-contract.ts";

const application = { id: "44afdbef-d010-4282-a44d-cb13cc1cd742", slug: "supplier-reporting", name: "Supplier Reporting" };
const snapshot = {
  applications: [application],
  roles: [
    { id: "role-user", applicationId: application.id, level: "user" },
    { id: "role-admin", applicationId: application.id, level: "admin" },
  ],
};

test("requires exactly one canonical application identifier", () => {
  assert.equal(coveAccessRequestSchema.safeParse({ applicationSlug: application.slug }).success, true);
  assert.equal(coveAccessRequestSchema.safeParse({ applicationId: application.id, applicationSlug: application.slug }).success, false);
  assert.equal(coveAccessRequestSchema.safeParse({ requiredRole: "admin" }).success, false);
});

test("resolves UUIDs and slugs against the same canonical registry", () => {
  assert.equal(resolveCanonicalApplication(snapshot, { applicationId: application.id, requiredRole: "user" })?.id, application.id);
  assert.equal(resolveCanonicalApplication(snapshot, { applicationSlug: application.slug, requiredRole: "user" })?.id, application.id);
});

test("distinguishes User from Admin grants server-side", () => {
  const userGrant = { roleIds: ["role-user"] };
  const adminGrant = { roleIds: ["role-user", "role-admin"] };
  assert.equal(accessLevelForGrant(snapshot, userGrant), "user");
  assert.equal(grantSatisfiesRequiredRole(snapshot, userGrant, "admin"), false);
  assert.equal(accessLevelForGrant(snapshot, adminGrant), "admin");
  assert.equal(grantSatisfiesRequiredRole(snapshot, adminGrant, "admin"), true);
});

test("uses the canonical permission namespace rule", () => {
  assert.equal(permissionNamespace("supplier-reporting"), "supplier_reporting");
  assert.equal(permissionNamespace("1mwu"), "app_1mwu");
});
