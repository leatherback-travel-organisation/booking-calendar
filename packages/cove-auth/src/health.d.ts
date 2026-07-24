import type { CoveApplicationReference } from "./core.js";

export type CoveHealthCheck = { id: string; status: "pass" | "fail"; message: string };
export type CoveHealthEvidence = {
  schema: "leatherback.cove-auth.health/v1";
  kitVersion: "1.1.0";
  provider: "cove";
  enforced: true;
  application?: { applicationId: string } | { applicationSlug: string };
  deploymentCommitSha?: string;
  status: "ready" | "needs_attention";
  checkedAt: string;
  checks: CoveHealthCheck[];
};
export type CoveHealthOptions = {
  application: CoveApplicationReference;
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  timeoutMs?: number;
};
export function inspectCoveAuthConfiguration(options: Pick<CoveHealthOptions, "application" | "env">): CoveHealthCheck[];
export function collectCoveAuthHealth(options: CoveHealthOptions): Promise<CoveHealthEvidence>;
export function createCoveAuthHealthHandler(options: CoveHealthOptions): () => Promise<Response>;
