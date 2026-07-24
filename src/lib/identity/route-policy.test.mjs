import assert from "node:assert/strict";
import test from "node:test";
import { isPublicIdentityRoute } from "./route-policy.ts";

test("Cove sign-in, health, token-authenticated access, and opaque icon routes reach their handlers", () => {
  assert.equal(isPublicIdentityRoute("/sign-in"), true);
  assert.equal(isPublicIdentityRoute("/sign-in/sso-callback"), true);
  assert.equal(isPublicIdentityRoute("/api/health"), true);
  assert.equal(isPublicIdentityRoute("/api/cove/access"), true);
  assert.equal(isPublicIdentityRoute("/api/delegate-handoff"), true);
  assert.equal(isPublicIdentityRoute("/api/cove/verify-handoff"), true);
  assert.equal(isPublicIdentityRoute("/api/app-icons/4f96c764-d6f7-4f7f-9d76-99ec9cc89e31"), true);
  assert.equal(isPublicIdentityRoute("/patch-quiz"), true);
  assert.equal(isPublicIdentityRoute("/stitch-wednesday"), true);
  assert.equal(isPublicIdentityRoute("/ai-growth"), true);
  assert.equal(isPublicIdentityRoute("/review-intelligence"), true);
  assert.equal(isPublicIdentityRoute("/people/apply"), true);
});

test("application pages and unrelated APIs remain protected by Clerk middleware", () => {
  assert.equal(isPublicIdentityRoute("/systems"), false);
  assert.equal(isPublicIdentityRoute("/api/money/submit"), false);
  assert.equal(isPublicIdentityRoute("/api/cove/access/extra"), false);
  assert.equal(isPublicIdentityRoute("/api/delegate-handoff/extra"), false);
  assert.equal(isPublicIdentityRoute("/api/cove/verify-handoff/extra"), false);
  assert.equal(isPublicIdentityRoute("/api/app-icons"), false);
});
