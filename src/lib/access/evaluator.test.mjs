import assert from "node:assert/strict";
import test from "node:test";

import { evaluateEntitlement, listAccessibleApplications } from "./evaluator.ts";
import { PREVIEW_NOW, previewAccessSnapshot, previewIdentities } from "./preview-data.ts";
import { AGENTIC_OS_APPLICATION_ID, RECRUITMENT_APPLICATION_ID, SUPERPANEL_APPLICATION_ID } from "./application-ids.ts";

test("team access exposes the preview super admin applications", () => {
  const apps = listAccessibleApplications({
    identity: previewIdentities.operations,
    snapshot: previewAccessSnapshot,
    now: PREVIEW_NOW,
  });
  assert.deepEqual(
    apps.map((app) => app.id),
    [AGENTIC_OS_APPLICATION_ID, RECRUITMENT_APPLICATION_ID, SUPERPANEL_APPLICATION_ID, "app-trtl", "app-answers", "app-supplier-portal", "app-1mwu", "app-money", "app-injuries"],
  );
});

test("SuperPanel appears in preview only through its Admin entitlement", () => {
  const granted = listAccessibleApplications({
    identity: previewIdentities.operations,
    snapshot: previewAccessSnapshot,
    now: PREVIEW_NOW,
  });
  assert.equal(granted.some((application) => application.id === SUPERPANEL_APPLICATION_ID), true);

  const withoutEntitlement = {
    ...previewAccessSnapshot,
    entitlements: previewAccessSnapshot.entitlements.filter(
      (entitlement) => entitlement.applicationId !== SUPERPANEL_APPLICATION_ID,
    ),
  };
  const denied = listAccessibleApplications({
    identity: previewIdentities.operations,
    snapshot: withoutEntitlement,
    now: PREVIEW_NOW,
  });
  assert.equal(denied.some((application) => application.id === SUPERPANEL_APPLICATION_ID), false);
});

test("every application defines User and Admin access provisions", () => {
  for (const application of previewAccessSnapshot.applications) {
    const levels = new Set(
      previewAccessSnapshot.roles
        .filter((role) => role.applicationId === application.id)
        .map((role) => role.level),
    );
    assert.deepEqual([...levels].sort(), ["admin", "user"], application.name);
  }
});

test("Cove never displays an application without an active entitlement", () => {
  const snapshot = {
    ...previewAccessSnapshot,
    entitlements: previewAccessSnapshot.entitlements.filter(
      (entitlement) => entitlement.applicationId !== "app-trtl" && entitlement.applicationId !== "app-answers",
    ),
  };

  const adminApps = listAccessibleApplications({
    identity: previewIdentities.operations,
    snapshot,
    now: PREVIEW_NOW,
  });
  assert.equal(adminApps.some((application) => application.id === "app-trtl"), false);
  assert.equal(adminApps.some((application) => application.id === "app-answers"), false);
});

test("external suppliers are restricted to the portal and their organisation", () => {
  const supplierPortal = evaluateEntitlement({
    identity: previewIdentities.supplier,
    applicationId: "app-supplier-portal",
    requiredPermission: "supplier.read_own",
    snapshot: previewAccessSnapshot,
    now: PREVIEW_NOW,
  });
  assert.equal(supplierPortal.allowed, true);
  if (supplierPortal.allowed) {
    assert.deepEqual(supplierPortal.scope.partnerOrganisationIds, ["partner-sunbird"]);
  }

  const trtl = evaluateEntitlement({
    identity: previewIdentities.supplier,
    applicationId: "app-trtl",
    snapshot: previewAccessSnapshot,
    now: PREVIEW_NOW,
  });
  assert.deepEqual(trtl, { allowed: false, reason: "population_not_allowed" });
});

test("unverified identity, expired grants and invalid roles fail closed", () => {
  const unverified = evaluateEntitlement({
    identity: { ...previewIdentities.operations, emailVerified: false },
    applicationId: "app-trtl",
    snapshot: previewAccessSnapshot,
    now: PREVIEW_NOW,
  });
  assert.deepEqual(unverified, { allowed: false, reason: "identity_unverified" });

  const expired = evaluateEntitlement({
    identity: previewIdentities.operations,
    applicationId: "app-trtl",
    snapshot: {
      ...previewAccessSnapshot,
      entitlements: previewAccessSnapshot.entitlements.map((entitlement) =>
        entitlement.id === "entitlement-operations-trtl"
          ? { ...entitlement, expiresAt: "2026-07-14T08:59:59.000Z" }
          : entitlement,
      ),
    },
    now: PREVIEW_NOW,
  });
  assert.deepEqual(expired, { allowed: false, reason: "no_active_entitlement" });

  const invalidRole = evaluateEntitlement({
    identity: previewIdentities.operations,
    applicationId: "app-trtl",
    snapshot: {
      ...previewAccessSnapshot,
      entitlements: previewAccessSnapshot.entitlements.map((entitlement) =>
        entitlement.id === "entitlement-operations-trtl"
          ? { ...entitlement, roleId: "missing-role" }
          : entitlement,
      ),
    },
    now: PREVIEW_NOW,
  });
  assert.deepEqual(invalidRole, { allowed: false, reason: "role_invalid" });
});

test("a permission must be explicitly present", () => {
  const decision = evaluateEntitlement({
    identity: previewIdentities.operations,
    applicationId: "app-trtl",
    requiredPermission: "trtl.delete",
    snapshot: previewAccessSnapshot,
    now: PREVIEW_NOW,
  });
  assert.deepEqual(decision, { allowed: false, reason: "permission_missing" });
});

test("an invalid evaluation clock fails closed", () => {
  const decision = evaluateEntitlement({
    identity: previewIdentities.operations,
    applicationId: "app-trtl",
    snapshot: previewAccessSnapshot,
    now: new Date("invalid"),
  });
  assert.deepEqual(decision, { allowed: false, reason: "evaluation_time_invalid" });
});

test("external partners cannot receive employee roles or cross-organisation scope", () => {
  const employeeRole = evaluateEntitlement({
    identity: previewIdentities.supplier,
    applicationId: "app-supplier-portal",
    requiredPermission: "supplier.manage_access",
    snapshot: {
      ...previewAccessSnapshot,
      entitlements: previewAccessSnapshot.entitlements.map((entitlement) =>
        entitlement.id === "entitlement-sunbird-supplier"
          ? { ...entitlement, roleId: "role-supplier-operations" }
          : entitlement,
      ),
    },
    now: PREVIEW_NOW,
  });
  assert.deepEqual(employeeRole, { allowed: false, reason: "role_population_mismatch" });

  const crossOrganisation = evaluateEntitlement({
    identity: previewIdentities.supplier,
    applicationId: "app-supplier-portal",
    requiredPermission: "supplier.read_own",
    snapshot: {
      ...previewAccessSnapshot,
      entitlements: previewAccessSnapshot.entitlements.map((entitlement) =>
        entitlement.id === "entitlement-sunbird-supplier"
          ? {
              ...entitlement,
              scope: {
                partnerOrganisationIds: ["partner-sunbird", "partner-other"],
              },
            }
          : entitlement,
      ),
    },
    now: PREVIEW_NOW,
  });
  assert.deepEqual(crossOrganisation, { allowed: false, reason: "scope_mismatch" });
});

test("permission scope is taken only from the entitlement granting it", () => {
  const splitRoles = {
    ...previewAccessSnapshot,
    roles: [
      ...previewAccessSnapshot.roles,
      {
        id: "role-supplier-extra",
        applicationId: "app-supplier-portal",
        key: "supplier_extra",
        name: "Supplier extra",
        level: "user",
        permissions: ["supplier.export_own"],
        allowedPopulations: ["external_partner"],
      },
    ],
    entitlements: [
      ...previewAccessSnapshot.entitlements,
      {
        id: "entitlement-supplier-extra",
        applicationId: "app-supplier-portal",
        roleId: "role-supplier-extra",
        subject: { type: "user", userId: "user-supplier" },
        scope: { partnerOrganisationIds: ["partner-sunbird"] },
        grantedByUserId: "user-operations",
        grantedAt: "2026-07-01T09:00:00.000Z",
      },
    ],
  };

  const decision = evaluateEntitlement({
    identity: previewIdentities.supplier,
    applicationId: "app-supplier-portal",
    requiredPermission: "supplier.export_own",
    snapshot: splitRoles,
    now: PREVIEW_NOW,
  });
  assert.equal(decision.allowed, true);
  if (decision.allowed) {
    assert.deepEqual(decision.entitlementIds, ["entitlement-supplier-extra"]);
    assert.deepEqual(decision.permissions, ["supplier.export_own"]);
  }
});
