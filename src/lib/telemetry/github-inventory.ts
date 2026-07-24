import type { ManagedAsset } from "@/lib/systems/model";

type JsonRecord = Readonly<Record<string, unknown>>;

export type GitHubRepositorySummary = {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly href: string;
  readonly description?: string;
  readonly visibility: "public" | "private" | "internal";
  readonly archived: boolean;
  readonly fork: boolean;
  readonly defaultBranch: string;
  readonly language?: string;
  readonly openIssueCount: number;
  readonly pushedAt?: string;
  readonly updatedAt: string;
  readonly sizeKb: number;
  readonly registeredAssetId?: string;
};

export type GitHubRepositoryInventory = {
  readonly state: "connected" | "not_configured" | "unavailable";
  readonly organisation: string;
  readonly repositories: readonly GitHubRepositorySummary[];
  readonly fetchedAt?: string;
  readonly message: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`GitHub returned an invalid ${key}.`);
  return value;
}

function optionalString(record: JsonRecord, key: string) {
  const value = record[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`GitHub returned an invalid ${key}.`);
  return value.trim() || undefined;
}

function requiredBoolean(record: JsonRecord, key: string) {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`GitHub returned an invalid ${key}.`);
  return value;
}

function requiredNumber(record: JsonRecord, key: string) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`GitHub returned an invalid ${key}.`);
  }
  return value;
}

function visibility(record: JsonRecord): GitHubRepositorySummary["visibility"] {
  const value = record.visibility;
  if (value === "public" || value === "private" || value === "internal") return value;
  if (typeof record.private === "boolean") return record.private ? "private" : "public";
  throw new Error("GitHub returned an invalid visibility.");
}

export function parseGitHubRepositoryInventory(input: {
  readonly organisation: string;
  readonly repositoryPayloads: readonly unknown[];
  readonly assets: readonly ManagedAsset[];
  readonly fetchedAt: string;
}): GitHubRepositoryInventory {
  const registeredRepositories = new Map(
    input.assets
      .filter((asset) => asset.repository)
      .map((asset) => [asset.repository!.path.toLowerCase(), asset.id]),
  );

  const repositories = input.repositoryPayloads.map((payload) => {
    if (!isRecord(payload)) throw new Error("GitHub returned a malformed repository.");
    const fullName = requiredString(payload, "full_name");
    const owner = fullName.split("/", 1)[0];
    if (owner.toLowerCase() !== input.organisation.toLowerCase()) {
      throw new Error("GitHub returned a repository outside the configured organisation.");
    }

    return {
      id: requiredNumber(payload, "id"),
      name: requiredString(payload, "name"),
      fullName,
      href: requiredString(payload, "html_url"),
      description: optionalString(payload, "description"),
      visibility: visibility(payload),
      archived: requiredBoolean(payload, "archived"),
      fork: requiredBoolean(payload, "fork"),
      defaultBranch: requiredString(payload, "default_branch"),
      language: optionalString(payload, "language"),
      openIssueCount: requiredNumber(payload, "open_issues_count"),
      pushedAt: optionalString(payload, "pushed_at"),
      updatedAt: requiredString(payload, "updated_at"),
      sizeKb: requiredNumber(payload, "size"),
      registeredAssetId: registeredRepositories.get(fullName.toLowerCase()),
    } satisfies GitHubRepositorySummary;
  });

  return {
    state: "connected",
    organisation: input.organisation,
    repositories,
    fetchedAt: input.fetchedAt,
    message: `Loaded ${repositories.length} repositories from GitHub.`,
  };
}
