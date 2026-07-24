import assert from "node:assert/strict";
import test from "node:test";
import { parseManagedAssetRow } from "./registry.ts";

const base = {
  id: "a18da1dc-11ee-43dd-a01a-14956299d89c",
  asset_kind: "application",
  application_id: "752f7ddb-7049-423c-94cf-e0e14ef1d13c",
  slug: "supplier-reporting",
  name: "Supplier Reporting",
  description: "Supplier reporting application.",
  product_owner_user_id: "87f9d918-1f38-4be6-b486-938c028aa739",
  product_owner_name: "Alex Owner",
  member_user_ids: [],
  repository_path: "leatherback-travel-organisation/supplier-reporting",
  repository_url: "https://github.com/leatherback-travel-organisation/supplier-reporting",
  production_url: "https://supplier-reporting.vercel.app",
  risk: "sensitive",
  status: "active",
  employee_access_policy: "all",
};

test("managed applications require the canonical Auth application UUID", () => {
  const application = parseManagedAssetRow(base);
  assert.equal(application.applicationId, base.application_id);
  assert.equal(application.employeeAccessPolicy, "all");
  assert.throws(() => parseManagedAssetRow({ ...base, application_id: null }), /linkage/);
});

test("managed websites never carry an Auth application UUID", () => {
  const website = parseManagedAssetRow({ ...base, id: "49057c40-f54e-47f4-b658-8a39aa873a6c", asset_kind: "website", application_id: null, slug: "company-site", employee_access_policy: null });
  assert.equal(website.assetKind, "website");
  assert.equal(website.applicationId, undefined);
  assert.equal(website.employeeAccessPolicy, "selected");
  assert.throws(() => parseManagedAssetRow({ ...base, asset_kind: "website", employee_access_policy: null }), /linkage/);
  assert.throws(() => parseManagedAssetRow({ ...base, asset_kind: "website", application_id: null }), /cannot carry/);
});

test("managed assets default safely and reject unknown employee access policies", () => {
  assert.equal(parseManagedAssetRow({ ...base, employee_access_policy: null }).employeeAccessPolicy, "selected");
  assert.throws(() => parseManagedAssetRow({ ...base, employee_access_policy: "sometimes" }), /employee access policy/);
});

test("managed asset database timestamps normalize to ISO strings", () => {
  const asset = parseManagedAssetRow({
    ...base,
    created_at: new Date("2026-07-15T20:00:00.000Z"),
    updated_at: "2026-07-15 21:30:00+00",
  });
  assert.equal(asset.createdAt, "2026-07-15T20:00:00.000Z");
  assert.equal(asset.updatedAt, "2026-07-15T21:30:00.000Z");
  assert.throws(() => parseManagedAssetRow({ ...base, created_at: "not-a-date" }), /created_at/);
});
