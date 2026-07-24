import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubRepositoryInventory } from "./github-inventory.ts";

const assets = [{
  id: "asset-trtl",
  applicationId: "app-trtl",
  assetKind: "application",
  slug: "trtl",
  name: "TRTL",
  description: "Trips",
  productionUrl: "https://trtl.vercel.app",
  productOwnerName: "Operations",
  memberUserIds: [],
  repository: {
    path: "leatherback-travel-organisation/trtl",
    href: "https://github.com/leatherback-travel-organisation/trtl",
  },
  status: "active",
  risk: "restricted",
}];

const repository = {
  id: 123,
  name: "trtl",
  full_name: "leatherback-travel-organisation/trtl",
  html_url: "https://github.com/leatherback-travel-organisation/trtl",
  description: "Trips and operational workflow",
  private: true,
  visibility: "private",
  archived: false,
  fork: false,
  default_branch: "main",
  language: "TypeScript",
  open_issues_count: 2,
  pushed_at: "2026-07-15T12:00:00Z",
  updated_at: "2026-07-15T12:00:00Z",
  size: 351,
};

test("GitHub inventory marks repositories already registered in Cove", () => {
  const result = parseGitHubRepositoryInventory({
    organisation: "leatherback-travel-organisation",
    repositoryPayloads: [repository],
    assets,
    fetchedAt: "2026-07-15T12:05:00Z",
  });

  assert.equal(result.state, "connected");
  assert.equal(result.repositories.length, 1);
  assert.equal(result.repositories[0].registeredAssetId, "asset-trtl");
  assert.equal(result.repositories[0].visibility, "private");
  assert.equal(result.repositories[0].language, "TypeScript");
});

test("GitHub inventory leaves newly discovered repositories unregistered", () => {
  const result = parseGitHubRepositoryInventory({
    organisation: "leatherback-travel-organisation",
    repositoryPayloads: [{ ...repository, id: 456, name: "new-app", full_name: "leatherback-travel-organisation/new-app" }],
    assets,
    fetchedAt: "2026-07-15T12:05:00Z",
  });

  assert.equal(result.repositories[0].registeredAssetId, undefined);
});

test("GitHub inventory rejects repositories outside the configured organisation", () => {
  assert.throws(() => parseGitHubRepositoryInventory({
    organisation: "leatherback-travel-organisation",
    repositoryPayloads: [{ ...repository, full_name: "someone-else/trtl" }],
    assets,
    fetchedAt: "2026-07-15T12:05:00Z",
  }), /outside the configured organisation/);
});
