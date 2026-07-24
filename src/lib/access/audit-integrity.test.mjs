import assert from "node:assert/strict";
import test from "node:test";

import { parseAuditRows } from "./audit-integrity.ts";

function row() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    occurred_at: "2026-07-15T05:30:00.000Z",
    action: "entitlement.application_access_changed",
    outcome: "success",
    actor_user_id: "22222222-2222-4222-8222-222222222222",
    actor_identity_subject: null,
    actor_name: "Cove Administrator",
    application_id: "33333333-3333-4333-8333-333333333333",
    application_name: "Your Money",
    target_type: "user",
    target_id: "44444444-4444-4444-8444-444444444444",
    request_id: "55555555-5555-4555-8555-555555555555",
    metadata: { application: "money", level: "admin", changed: true },
  };
}

test("audit feed accepts a redacted, referentially complete event", () => {
  const [event] = parseAuditRows([row()]);
  assert.equal(event.actorName, "Cove Administrator");
  assert.equal(event.applicationName, "Your Money");
  assert.deepEqual(event.metadata, { application: "money", level: "admin", changed: true });
});

test("audit feed labels deleted actors and system activity honestly", () => {
  const identityEvent = row();
  identityEvent.actor_user_id = null;
  identityEvent.actor_name = null;
  identityEvent.actor_identity_subject = "clerk:user_123";
  assert.equal(parseAuditRows([identityEvent])[0].actorName, "Verified identity");

  const systemEvent = row();
  systemEvent.actor_user_id = null;
  systemEvent.actor_name = null;
  systemEvent.actor_identity_subject = null;
  assert.equal(parseAuditRows([systemEvent])[0].actorName, "System");
});

test("audit feed rejects malformed references, outcomes, and duplicate IDs", () => {
  const badReference = row();
  badReference.actor_user_id = "not-an-id";
  assert.throws(() => parseAuditRows([badReference]), /not a UUID/);

  const badOutcome = row();
  badOutcome.outcome = "allowed";
  assert.throws(() => parseAuditRows([badOutcome]), /outcome is invalid/);

  assert.throws(() => parseAuditRows([row(), row()]), /duplicate event IDs/);
});

test("audit feed rejects secret-shaped or nested metadata", () => {
  const secret = row();
  secret.metadata = { access_token: "do-not-render" };
  assert.throws(() => parseAuditRows([secret]), /forbidden field/);

  const nested = row();
  nested.metadata = { payload: { email: "person@example.com" } };
  assert.throws(() => parseAuditRows([nested]), /metadata field payload is invalid/);
});

test("audit feed rejects incomplete targets and unsafe text", () => {
  const incomplete = row();
  incomplete.target_id = null;
  assert.throws(() => parseAuditRows([incomplete]), /target fields are incomplete/);

  const unsafe = row();
  unsafe.actor_name = "Admin\nInjected";
  assert.throws(() => parseAuditRows([unsafe]), /actor_name is invalid/);
});
