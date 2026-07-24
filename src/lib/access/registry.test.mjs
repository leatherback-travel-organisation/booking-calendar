import assert from "node:assert/strict";
import test from "node:test";

import { parseApplicationRegistry, parseApplicationRegistryRow } from "./registry.ts";
import { emergencyApplicationDirectory } from "./emergency-directory.ts";
import { previewAccessSnapshot } from "./preview-data.ts";

const application = {
  id: "app-trtl",
  slug: "trtl",
  name: "TRTL",
  description: "Trips and bookings",
  launch_url: "https://trtl.vercel.app",
  owner_name: "Operations",
  repository_path: "leatherback-travel-organisation/trtl",
  repository_url: "https://github.com/leatherback-travel-organisation/trtl",
  status: "active",
  risk: "restricted",
  product_owner_user_id: "87f9d918-1f38-4be6-b486-938c028aa739",
  cove_audience: "selected",
  asset_kind: "application",
  allows_employees: true,
  allows_external_partners: false,
  employee_access_policy: "all",
};

test("application registry accepts and normalizes a complete HTTPS record", () => {
  const parsed = parseApplicationRegistryRow(application);
  assert.equal(parsed.launchUrl, "https://trtl.vercel.app/");
  assert.deepEqual(parsed.repository, {
    path: "leatherback-travel-organisation/trtl",
    href: "https://github.com/leatherback-travel-organisation/trtl",
  });
  assert.deepEqual(parsed.allowedPopulations, ["employee"]);
  assert.equal(parsed.employeeAccessPolicy, "all");
});

test("application registry rejects unsafe or malformed launch URLs", () => {
  for (const launch_url of [
    "javascript:alert(1)",
    "http://trtl.example.test",
    "https://user:password@trtl.example.test",
    "not a URL",
  ]) {
    assert.throws(
      () => parseApplicationRegistryRow({ ...application, launch_url }),
      /HTTPS URL|valid URL/,
    );
  }
});

test("application registry rejects incomplete or mismatched repositories", () => {
  assert.throws(
    () => parseApplicationRegistryRow({ ...application, repository_url: null }),
    /complete GitHub/,
  );
  assert.throws(
    () => parseApplicationRegistryRow({ ...application, repository_url: "https://github.com/other/trtl" }),
    /does not match/,
  );
  assert.throws(
    () =>
      parseApplicationRegistryRow({
        ...application,
        repository_url: "https://example.test/leatherback-travel-organisation/trtl",
      }),
    /does not match/,
  );
});

test("application registry rejects invalid policy values and duplicate records", () => {
  assert.throws(
    () => parseApplicationRegistryRow({ ...application, status: "unknown" }),
    /status/,
  );
  assert.throws(
    () => parseApplicationRegistryRow({ ...application, allows_employees: false }),
    /identity population/,
  );
  assert.throws(
    () => parseApplicationRegistryRow({ ...application, employee_access_policy: "sometimes" }),
    /employee access policy/,
  );
  assert.throws(() => parseApplicationRegistry([]), /empty/);
  assert.throws(() => parseApplicationRegistry([application, application]), /duplicate IDs/);
});

test("emergency directory is complete, safe, and matches the application catalogue", () => {
  const expected = previewAccessSnapshot.applications
    .filter((candidate) => candidate.status === "active")
    .map(({ slug, name, launchUrl: url }) => ({ slug, name, url }));

  assert.deepEqual(emergencyApplicationDirectory, expected);
  assert.equal(new Set(emergencyApplicationDirectory.map(({ slug }) => slug)).size, expected.length);

  for (const applicationLink of emergencyApplicationDirectory) {
    const url = new URL(applicationLink.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
  }
});
