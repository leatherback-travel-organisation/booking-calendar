import assert from "node:assert/strict";
import test from "node:test";

import { parseAccessPolicyRows } from "./policy-integrity.ts";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  app: "22222222-2222-4222-8222-222222222222",
  role: "33333333-3333-4333-8333-333333333333",
  entitlement: "44444444-4444-4444-8444-444444444444",
};

function rows() {
  return {
    userReferenceRows: [{ id: ids.user }],
    userRows: [{
      id: ids.user,
      identity_subject: "clerk:user_123",
      identity_issuer: "https://clerk.example.test",
      population: "employee",
      email: "person@leatherbacktravel.com",
      display_name: "Cove Person",
      status: "active",
      workspace_domain: "leatherbacktravel.com",
      partner_organisation_id: null,
      session_version: 1,
    }],
    platformRoleRows: [{ user_id: ids.user, role: "access_admin", granted_by_user_id: ids.user }],
    organisationRows: [],
    teamRows: [],
    membershipRows: [],
    applicationRows: [{
      id: ids.app,
      slug: "money",
      name: "Your Money",
      description: "Money operations",
      launch_url: "https://lbcove.vercel.app/money",
      owner_name: "Finance",
      repository_path: null,
      repository_url: null,
      status: "active",
      risk: "sensitive",
      allows_employees: true,
      allows_external_partners: false,
    }],
    applicationRoleRows: [{
      id: ids.role,
      application_id: ids.app,
      role_key: "user",
      name: "Money User",
      access_level: "user",
      permissions: ["money.read_own", "money.submit"],
      allows_employees: true,
      allows_external_partners: false,
    }],
    entitlementRows: [{
      id: ids.entitlement,
      application_id: ids.app,
      role_id: ids.role,
      subject_type: "user",
      user_id: ids.user,
      team_id: null,
      all_partner_organisations: false,
      partner_organisation_ids: [],
      starts_at: "2026-07-01T00:00:00.000Z",
      expires_at: "2026-08-01T00:00:00.000Z",
      revoked_at: null,
      revoked_reason: null,
      granted_by_user_id: ids.user,
      granted_at: "2026-07-01T00:00:00.000Z",
    }],
  };
}

test("access policy parser accepts a complete bounded grant", () => {
  const snapshot = parseAccessPolicyRows(rows());
  assert.equal(snapshot.users[0].platformRoles[0], "access_admin");
  assert.equal(snapshot.entitlements[0].expiresAt, "2026-08-01T00:00:00.000Z");
  assert.deepEqual(snapshot.roles[0].permissions, ["money.read_own", "money.submit"]);
});

test("access policy parser never erases malformed grant timestamps", () => {
  const input = rows();
  input.entitlementRows[0].expires_at = "not-a-timestamp";
  assert.throws(() => parseAccessPolicyRows(input), /expires_at is not a valid timestamp/);
});

test("access policy parser rejects corrupt identity and permission values", () => {
  const badIdentity = rows();
  badIdentity.userRows[0].session_version = 0;
  assert.throws(() => parseAccessPolicyRows(badIdentity), /session version/);

  const badPermission = rows();
  badPermission.applicationRoleRows[0].permissions = ["money read"];
  assert.throws(() => parseAccessPolicyRows(badPermission), /invalid permission/);
});

test("access policy parser rejects Cove platform roles for external partners", () => {
  const input = rows();
  input.organisationRows = [{
    id: "55555555-5555-4555-8555-555555555555",
    name: "Example partner",
    status: "active",
  }];
  input.userRows[0].population = "external_partner";
  input.userRows[0].workspace_domain = null;
  input.userRows[0].partner_organisation_id = input.organisationRows[0].id;
  assert.throws(() => parseAccessPolicyRows(input), /External partners cannot hold Cove platform roles/);
});

test("access policy parser rejects contradictory scopes and cross-application roles", () => {
  const contradictory = rows();
  contradictory.entitlementRows[0].all_partner_organisations = true;
  contradictory.entitlementRows[0].partner_organisation_ids = ["55555555-5555-4555-8555-555555555555"];
  assert.throws(() => parseAccessPolicyRows(contradictory), /contradictory entitlement scope/);

  const wrongApplication = rows();
  wrongApplication.entitlementRows[0].application_id = "66666666-6666-4666-8666-666666666666";
  wrongApplication.applicationRows.push({ ...wrongApplication.applicationRows[0], id: "66666666-6666-4666-8666-666666666666", slug: "injuries" });
  assert.throws(() => parseAccessPolicyRows(wrongApplication), /different application/);
});

test("access policy parser preserves valid grants for invited users without identities", () => {
  const input = rows();
  const invitedUserId = "77777777-7777-4777-8777-777777777777";
  input.userReferenceRows.push({ id: invitedUserId });
  input.entitlementRows[0].user_id = invitedUserId;

  const snapshot = parseAccessPolicyRows(input);
  assert.equal(snapshot.users.length, 1);
  assert.deepEqual(snapshot.entitlements[0].subject, {
    type: "user",
    userId: invitedUserId,
  });
});

test("access policy parser rejects orphaned user-bearing authorization edges", () => {
  const orphanId = "88888888-8888-4888-8888-888888888888";

  const orphanRole = rows();
  orphanRole.platformRoleRows[0].user_id = orphanId;
  assert.throws(() => parseAccessPolicyRows(orphanRole), /unknown platform-role user/);

  const orphanMembership = rows();
  orphanMembership.teamRows.push({
    id: "99999999-9999-4999-8999-999999999999",
    name: "Operations",
    description: "",
    status: "active",
  });
  orphanMembership.membershipRows.push({
    team_id: orphanMembership.teamRows[0].id,
    user_id: orphanId,
    starts_at: null,
    expires_at: null,
    revoked_at: null,
    granted_by_user_id: ids.user,
  });
  assert.throws(() => parseAccessPolicyRows(orphanMembership), /unknown membership user/);

  const orphanEntitlement = rows();
  orphanEntitlement.entitlementRows[0].user_id = orphanId;
  assert.throws(() => parseAccessPolicyRows(orphanEntitlement), /unknown entitlement user/);

  const orphanGrantor = rows();
  orphanGrantor.entitlementRows[0].granted_by_user_id = orphanId;
  assert.throws(() => parseAccessPolicyRows(orphanGrantor), /unknown entitlement grantor/);
});
