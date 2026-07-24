import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationById,
  applicationBySlug,
  buildAccessRequestBody,
  normalizeApplicationReference,
  parseAccessDecision,
  resolveAccessApiUrl,
  roleSatisfies,
} from "../src/core.js";

const applicationId = "123e4567-e89b-42d3-a456-426614174000";

test("application references use strict UUID IDs and canonical slugs", () => {
  assert.deepEqual(normalizeApplicationReference(applicationId), { applicationId });
  assert.deepEqual(normalizeApplicationReference("app-money"), { applicationSlug: "app-money" });
  assert.deepEqual(applicationById(applicationId), { applicationId });
  assert.deepEqual(applicationBySlug("supplier-portal"), { applicationSlug: "supplier-portal" });
  assert.throws(() => normalizeApplicationReference({ applicationId, applicationSlug: "money" }), /exactly one/);
});

test("access bodies contain exactly one application selector and the canonical role", () => {
  assert.deepEqual(buildAccessRequestBody({ applicationId }, "admin"), { applicationId, requiredRole: "admin" });
  assert.deepEqual(buildAccessRequestBody({ applicationSlug: "money" }, "user"), { applicationSlug: "money", requiredRole: "user" });
  assert.throws(() => buildAccessRequestBody("money", "owner"), /user.*admin/);
});

test("Admin satisfies User but User never satisfies Admin", () => {
  assert.equal(roleSatisfies("admin", "user"), true);
  assert.equal(roleSatisfies("admin", "admin"), true);
  assert.equal(roleSatisfies("user", "user"), true);
  assert.equal(roleSatisfies("user", "admin"), false);
});

test("canonical Cove grants are validated and copied", () => {
  const payload = {
    allowed: true,
    application: { id: applicationId, slug: "money", name: "Money" },
    user: { id: "user-1" },
    role: "admin",
    permissions: ["money:read", "money:write"],
    checkedAt: "2026-07-16T12:00:00.000Z",
  };
  assert.deepEqual(parseAccessDecision(payload, "admin"), payload);
  assert.deepEqual(parseAccessDecision({ allowed: true, ...payload, role: "user" }, "admin"), {
    allowed: false,
    code: "role_required",
    message: "This action requires Cove admin access.",
  });
  assert.throws(() => parseAccessDecision({ allowed: true, role: "user" }), /incomplete/);
});

test("access URL defaults to Cove POST endpoint and forbids query configuration", () => {
  assert.equal(resolveAccessApiUrl({ COVE_PRIMARY_URL: "https://lbcove.vercel.app" }), "https://lbcove.vercel.app/api/cove/access");
  assert.throws(() => resolveAccessApiUrl({ COVE_ACCESS_API_URL: "https://example.com/access?token=no" }), /query string/);
});
