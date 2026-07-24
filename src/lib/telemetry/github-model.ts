import type { CheckRunSummary, GitHubTelemetry } from "./model";

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`GitHub returned an invalid ${key}.`);
  return value;
}

function requiredBoolean(record: JsonRecord, key: string) {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`GitHub returned an invalid ${key}.`);
  return value;
}

function checkRunSummary(payload: unknown): CheckRunSummary {
  if (!isRecord(payload) || !Array.isArray(payload.check_runs)) {
    throw new Error("GitHub returned an invalid check-runs response.");
  }

  let passing = 0;
  let failing = 0;
  let pending = 0;
  for (const run of payload.check_runs) {
    if (!isRecord(run) || typeof run.status !== "string") {
      throw new Error("GitHub returned a malformed check run.");
    }
    if (run.status !== "completed") {
      pending += 1;
      continue;
    }
    if (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped") passing += 1;
    else failing += 1;
  }

  return { state: "available", total: payload.check_runs.length, passing, failing, pending };
}

export function parseGitHubTelemetry(input: {
  readonly expectedRepositoryPath: string;
  readonly repositoryPayload: unknown;
  readonly checkRunsPayload?: unknown;
  readonly checksMessage?: string;
  readonly fetchedAt: string;
}): GitHubTelemetry {
  if (!isRecord(input.repositoryPayload)) throw new Error("GitHub returned an invalid repository response.");

  const repositoryPath = requiredString(input.repositoryPayload, "full_name");
  if (repositoryPath.toLowerCase() !== input.expectedRepositoryPath.toLowerCase()) {
    throw new Error("GitHub returned a different repository than the registered application.");
  }

  const pushedAt = input.repositoryPayload.pushed_at;
  if (pushedAt !== null && typeof pushedAt !== "string") throw new Error("GitHub returned an invalid pushed_at value.");

  const checks = input.checkRunsPayload === undefined
    ? { state: "unavailable", total: 0, passing: 0, failing: 0, pending: 0, message: input.checksMessage ?? "Check runs are unavailable." } satisfies CheckRunSummary
    : checkRunSummary(input.checkRunsPayload);

  return {
    state: "connected",
    repositoryPath,
    defaultBranch: requiredString(input.repositoryPayload, "default_branch"),
    visibility: requiredBoolean(input.repositoryPayload, "private") ? "private" : "public",
    archived: requiredBoolean(input.repositoryPayload, "archived"),
    pushedAt: pushedAt ?? undefined,
    fetchedAt: input.fetchedAt,
    checks,
    message: "Read-only GitHub repository telemetry is connected.",
  };
}
