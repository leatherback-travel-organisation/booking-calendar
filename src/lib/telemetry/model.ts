export type IntegrationState = "connected" | "not_configured" | "unavailable" | "not_applicable";

export type CheckRunSummary = {
  readonly state: "available" | "unavailable";
  readonly total: number;
  readonly passing: number;
  readonly failing: number;
  readonly pending: number;
  readonly message?: string;
};

export type GitHubTelemetry = {
  readonly state: IntegrationState;
  readonly repositoryPath?: string;
  readonly defaultBranch?: string;
  readonly visibility?: "public" | "private";
  readonly archived?: boolean;
  readonly pushedAt?: string;
  readonly fetchedAt?: string;
  readonly checks?: CheckRunSummary;
  readonly branchProtected?: boolean;
  readonly readmePresent?: boolean;
  readonly codeownersPresent?: boolean;
  readonly secretScanningEnabled?: boolean;
  readonly message: string;
};

export type DeploymentTelemetry = {
  readonly state: IntegrationState;
  readonly message: string;
};

export type AssetTelemetry = {
  readonly assetId: string;
  readonly github: GitHubTelemetry;
  readonly deployments: DeploymentTelemetry;
};

export type HygieneCheckStatus = "passed" | "failed" | "unavailable";

export type HygieneCheck = {
  readonly key: string;
  readonly label: string;
  readonly status: HygieneCheckStatus;
  readonly evidence: string;
  readonly owner: "Cove" | "Product owner" | "Application team" | "Website team";
};

export type AssetHygiene = {
  readonly assetId: string;
  readonly state: "ready" | "needs_work" | "incomplete_evidence";
  readonly checkedAt: string;
  readonly checks: readonly HygieneCheck[];
};
