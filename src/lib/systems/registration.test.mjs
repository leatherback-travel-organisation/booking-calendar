import assert from "node:assert/strict";
import test from "node:test";
import { assetSlug, existingAssetRegistrationSchema, managedAssetProfileUpdateSchema, parseCompanyRepositoryUrl, parseProductionUrl } from "./registration.ts";

const registration = {
  name: "Supplier Reporting",
  assetKind: "application",
  description: "Supplier performance reporting and follow-up.",
  productOwnerUserId: "87f9d918-1f38-4be6-b486-938c028aa739",
  teamMemberUserIds: ["1293d75d-a1ca-4b17-ad99-a2a0f3140b93"],
  risk: "sensitive",
  repositoryUrl: "https://github.com/leatherback-travel-organisation/supplier-reporting",
  productionUrl: "https://supplier-reporting.vercel.app",
  requestId: "043af570-f5bb-4a30-bc88-907d4af7fc4c",
  status: "active",
};

test("existing asset registration accepts the agreed systems fields", () => {
  const parsed = existingAssetRegistrationSchema.parse(registration);
  assert.equal(parsed.name, "Supplier Reporting");
  assert.equal(parsed.employeeAccessPolicy, "selected");
  assert.equal(assetSlug(registration.name), "supplier-reporting");
  assert.deepEqual(parseCompanyRepositoryUrl(`${registration.repositoryUrl}.git`), { path: "leatherback-travel-organisation/supplier-reporting", href: registration.repositoryUrl });
  assert.equal(parseProductionUrl(registration.productionUrl), `${registration.productionUrl}/`);
});

test("application registration preserves the evergreen all-users policy", () => {
  const parsed = existingAssetRegistrationSchema.parse({
    ...registration,
    employeeAccessPolicy: "all",
  });
  assert.equal(parsed.employeeAccessPolicy, "all");
});

test("website registration carries no authorization audience or application identifier", () => {
  const website = existingAssetRegistrationSchema.parse({ ...registration, assetKind: "website" });
  assert.equal(website.assetKind, "website");
  assert.equal("audience" in website, false);
  assert.equal("applicationId" in website, false);
  assert.equal(existingAssetRegistrationSchema.safeParse({ ...registration, assetKind: "website", employeeAccessPolicy: "all" }).success, false);
});

test("registration accepts canonical custom domains and rejects unsafe production URLs", () => {
  assert.throws(() => parseCompanyRepositoryUrl("https://github.com/leatherbacktravel/supplier-reporting"), /organisation/);
  assert.equal(parseProductionUrl("https://td.leatherbacktravel.com"), "https://td.leatherbacktravel.com/");
  assert.throws(() => parseProductionUrl("http://td.leatherbacktravel.com"), /secure HTTPS/);
  assert.throws(() => parseProductionUrl("https://user:secret@td.leatherbacktravel.com"), /secure HTTPS/);
  assert.throws(() => parseProductionUrl("https://td.leatherbacktravel.com:8443"), /secure HTTPS/);
  assert.equal(existingAssetRegistrationSchema.safeParse({ ...registration, teamMemberUserIds: [registration.productOwnerUserId] }).success, false);
});

test("registration can begin before GitHub publication", () => {
  assert.equal(existingAssetRegistrationSchema.parse({ ...registration, repositoryUrl: "" }).repositoryUrl, "");
});

test("managed asset profiles keep their stable ID while editable fields change", () => {
  const update = managedAssetProfileUpdateSchema.parse({
    ...registration,
    assetId: "a18da1dc-11ee-43dd-a01a-14956299d89c",
    name: "Supplier Portal",
    repositoryUrl: "",
  });
  assert.equal(update.assetId, "a18da1dc-11ee-43dd-a01a-14956299d89c");
  assert.equal(update.name, "Supplier Portal");
  assert.equal(update.repositoryUrl, "");
});
