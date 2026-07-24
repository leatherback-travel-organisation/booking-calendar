import assert from "node:assert/strict";
import test from "node:test";

import { parseAccessDirectoryRows } from "./directory-integrity.ts";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  app: "22222222-2222-4222-8222-222222222222",
};

function rows() {
  return {
    personRows: [{
      id: ids.user,
      population: "employee",
      email: "person@leatherbacktravel.com",
      display_name: "Cove Person",
      status: "active",
      identity_count: 0,
      last_authenticated_at: null,
      invited_at: "2026-07-01T00:00:00.000Z",
      invitation_expires_at: "2026-07-20T00:00:00.000Z",
      invitation_status: "pending",
      platform_roles: ["access_admin"],
      application_access: { money: "admin" },
    }],
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
      employee_access_policy: "all",
    }],
  };
}

test("access directory accepts a verified invitation and registered access", () => {
  const directory = parseAccessDirectoryRows({ ...rows(), now: new Date("2026-07-15T00:00:00.000Z") });
  assert.equal(directory.people[0].status, "invited");
  assert.equal(directory.people[0].population, "employee");
  assert.deepEqual(directory.people[0].applicationAccess, { money: "admin" });
  assert.equal(directory.applications[0].employeeAccessPolicy, "all");
});

test("access directory reports expired and revoked invitations honestly", () => {
  const expired = rows();
  assert.equal(
    parseAccessDirectoryRows({ ...expired, now: new Date("2026-07-21T00:00:00.000Z") }).people[0].status,
    "invitation_expired",
  );

  const revoked = rows();
  revoked.personRows[0].invitation_status = "revoked";
  assert.equal(
    parseAccessDirectoryRows({ ...revoked, now: new Date("2026-07-15T00:00:00.000Z") }).people[0].status,
    "invitation_revoked",
  );
});

test("access directory rejects malformed operational status and references", () => {
  const badStatus = rows();
  badStatus.personRows[0].status = "enabled";
  assert.throws(() => parseAccessDirectoryRows(badStatus), /invalid user status/);

  const badAccess = rows();
  badAccess.personRows[0].application_access = { unknown: "owner" };
  assert.throws(() => parseAccessDirectoryRows(badAccess), /unknown application/);

  const badId = rows();
  badId.personRows[0].id = "not-a-user-id";
  assert.throws(() => parseAccessDirectoryRows(badId), /not a UUID/);
});

test("access directory rejects contradictory identity and invitation state", () => {
  const acceptedWithoutIdentity = rows();
  acceptedWithoutIdentity.personRows[0].invitation_status = "accepted";
  assert.throws(() => parseAccessDirectoryRows(acceptedWithoutIdentity), /without a bound identity/);

  const pendingWithIdentity = rows();
  pendingWithIdentity.personRows[0].identity_count = 1;
  pendingWithIdentity.personRows[0].last_authenticated_at = "2026-07-14T12:00:00.000Z";
  assert.throws(() => parseAccessDirectoryRows(pendingWithIdentity), /pending invitation for a bound identity/);
});

test("access directory rejects platform administration for external partners", () => {
  const input = rows();
  input.personRows[0].population = "external_partner";
  input.personRows[0].platform_roles = ["access_admin"];
  assert.throws(() => parseAccessDirectoryRows(input), /External partners cannot hold Cove platform roles/);
});
