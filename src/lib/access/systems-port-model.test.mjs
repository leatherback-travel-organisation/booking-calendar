import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApplicationAccessSummary,
  parseActiveCovePeopleRows,
  parseProvisionApplicationInput,
} from "./systems-port-model.ts";
import {
  SUPERPANEL_ADMIN_ROLE_ID,
  SUPERPANEL_APPLICATION_ID,
  SUPERPANEL_APPLICATION_SLUG,
  SUPERPANEL_USER_ROLE_ID,
  superPanelAccessLevelForPlatformRoles,
} from "./application-ids.ts";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  owner: "22222222-2222-4222-8222-222222222222",
  member: "33333333-3333-4333-8333-333333333333",
  application: "44444444-4444-4444-8444-444444444444",
  team: "55555555-5555-4555-8555-555555555555",
  userRole: "66666666-6666-4666-8666-666666666666",
  adminRole: "77777777-7777-4777-8777-777777777777",
};

test("SuperPanel has stable identifiers and only Systems platform roles map to its Admin entitlement", () => {
  assert.equal(SUPERPANEL_APPLICATION_ID, "4f96c764-d6f7-4f7f-9d76-99ec9cc89e31");
  assert.equal(SUPERPANEL_APPLICATION_SLUG, "superpanel");
  assert.equal(SUPERPANEL_USER_ROLE_ID, "59e25954-bfc8-4ceb-a55d-c8b0b50c7b6a");
  assert.equal(SUPERPANEL_ADMIN_ROLE_ID, "0ab6228f-acde-44df-aef3-9475d30f72e1");
  assert.equal(superPanelAccessLevelForPlatformRoles(["systems_admin"]), "admin");
  assert.equal(superPanelAccessLevelForPlatformRoles(["super_admin"]), "admin");
  assert.equal(superPanelAccessLevelForPlatformRoles(["access_admin"]), null);
});

test("application provisioning normalizes the URL and removes duplicate or owner member grants", () => {
  const parsed = parseProvisionApplicationInput({
    requestId: ids.actor,
    slug: "trip-operations",
    name: "Trip Operations",
    description: "Booking and trip operations.",
    launchUrl: "https://trips.example.com/start#ignored",
    ownerUserId: ids.owner,
    memberUserIds: [ids.owner, ids.member, ids.member],
  });

  assert.equal(parsed.launchUrl, "https://trips.example.com/start");
  assert.equal(parsed.employeeAccessPolicy, "selected");
  assert.deepEqual(parsed.memberUserIds, [ids.member]);
});

test("all-user provisioning records an evergreen policy instead of a current-user snapshot", () => {
  const parsed = parseProvisionApplicationInput({
    requestId: ids.actor,
    slug: "trip-operations",
    name: "Trip Operations",
    description: "Booking and trip operations.",
    launchUrl: "https://trips.example.com",
    ownerUserId: ids.owner,
    memberUserIds: [ids.member],
    employeeAccessPolicy: "all",
  });

  assert.equal(parsed.employeeAccessPolicy, "all");
  assert.deepEqual(parsed.memberUserIds, []);
});

test("the Systems people picker parser exposes active and invited approved people", () => {
  assert.deepEqual(parseActiveCovePeopleRows([
    {
      user_id: ids.owner,
      display_name: "Matthew Newton",
      verified_email: "MATTHEW@LEATHERBACKTRAVEL.COM",
      directory_status: "active",
      identity_verified: true,
    },
    {
      user_id: ids.member,
      display_name: "Radina Petrishka",
      verified_email: "radina@leatherbacktravel.com",
      directory_status: "invited",
      identity_verified: false,
    },
  ]), [
    {
      userId: ids.owner,
      displayName: "Matthew Newton",
      verifiedEmail: "matthew@leatherbacktravel.com",
      status: "active",
      identityVerified: true,
    },
    {
      userId: ids.member,
      displayName: "Radina Petrishka",
      verifiedEmail: "radina@leatherbacktravel.com",
      status: "invited",
      identityVerified: false,
    },
  ]);

  assert.throws(() => parseActiveCovePeopleRows([
    { user_id: ids.owner, display_name: "One", verified_email: "one@leatherbacktravel.com", directory_status: "active", identity_verified: true },
    { user_id: ids.owner, display_name: "Two", verified_email: "two@leatherbacktravel.com", directory_status: "active", identity_verified: true },
  ]), /duplicate user IDs/);

  assert.throws(() => parseActiveCovePeopleRows([
    { user_id: ids.owner, display_name: "Wrong", verified_email: "wrong@leatherbacktravel.com", directory_status: "invited", identity_verified: true },
  ]), /inconsistent identity status/);
});

test("the read-only application summary resolves effective User/Admin access without mutating grants", () => {
  const snapshot = {
    users: [
      {
        id: ids.owner,
        identitySubject: "owner-subject",
        identityIssuer: "google",
        population: "employee",
        email: "owner@leatherbacktravel.com",
        displayName: "Owner",
        status: "active",
        workspaceDomain: "leatherbacktravel.com",
        platformRoles: [],
        sessionVersion: 1,
      },
      {
        id: ids.member,
        identitySubject: "member-subject",
        identityIssuer: "google",
        population: "employee",
        email: "member@leatherbacktravel.com",
        displayName: "Member",
        status: "active",
        workspaceDomain: "leatherbacktravel.com",
        platformRoles: [],
        sessionVersion: 1,
      },
    ],
    partnerOrganisations: [],
    teams: [{ id: ids.team, name: "Operations", description: "", status: "active" }],
    teamMemberships: [{ teamId: ids.team, userId: ids.member }],
    applications: [{
      id: ids.application,
      slug: "trip-operations",
      name: "Trip Operations",
      description: "",
      launchUrl: "https://trips.example.com/",
      owner: "Owner",
      status: "active",
      risk: "standard",
      allowedPopulations: ["employee"],
    }],
    roles: [
      {
        id: ids.userRole,
        applicationId: ids.application,
        key: "user",
        name: "User",
        level: "user",
        permissions: ["trip-operations.open"],
        allowedPopulations: ["employee"],
      },
      {
        id: ids.adminRole,
        applicationId: ids.application,
        key: "admin",
        name: "Admin",
        level: "admin",
        permissions: ["trip-operations.open", "trip-operations.manage_access"],
        allowedPopulations: ["employee"],
      },
    ],
    entitlements: [
      {
        id: "owner-admin",
        applicationId: ids.application,
        roleId: ids.adminRole,
        subject: { type: "user", userId: ids.owner },
        grantedByUserId: ids.actor,
        grantedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "team-user",
        applicationId: ids.application,
        roleId: ids.userRole,
        subject: { type: "team", teamId: ids.team },
        grantedByUserId: ids.actor,
        grantedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "expired-member-admin",
        applicationId: ids.application,
        roleId: ids.adminRole,
        subject: { type: "user", userId: ids.member },
        expiresAt: "2026-07-10T00:00:00.000Z",
        grantedByUserId: ids.actor,
        grantedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  };

  assert.deepEqual(
    buildApplicationAccessSummary(snapshot, ids.application, new Date("2026-07-15T00:00:00.000Z")),
    {
      applicationId: ids.application,
      users: [
        { userId: ids.member, displayName: "Member", verifiedEmail: "member@leatherbacktravel.com", level: "user" },
        { userId: ids.owner, displayName: "Owner", verifiedEmail: "owner@leatherbacktravel.com", level: "admin" },
      ],
      userCount: 1,
      adminCount: 1,
    },
  );
});
