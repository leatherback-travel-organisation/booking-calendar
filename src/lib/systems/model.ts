import type { ApplicationRisk, EmployeeAccessPolicy } from "@/lib/access/model";

export type { ActiveCovePerson, ApplicationAccessSummary } from "@/lib/access/systems-port-model";

export type AssetKind = "application" | "website";
export type OperationalStatus = "active" | "maintenance" | "retired";

export type ManagedAsset = {
  readonly id: string;
  readonly assetKind: AssetKind;
  /** Canonical Auth application UUID. Always present for apps and absent for websites. */
  readonly applicationId?: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly productOwnerUserId?: string;
  readonly productOwnerName: string;
  readonly memberUserIds: readonly string[];
  readonly repository?: { readonly path: string; readonly href: string };
  readonly productionUrl: string;
  readonly vercelProjectId?: string;
  readonly risk: ApplicationRisk;
  readonly status: OperationalStatus;
  readonly employeeAccessPolicy: EmployeeAccessPolicy;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type ManagedAssetRegistrationResult =
  | { readonly ok: true; readonly assetId: string; readonly applicationId?: string; readonly message: string }
  | { readonly ok: false; readonly message: string };

export type ManagedAssetUpdateResult =
  | { readonly ok: true; readonly assetId: string; readonly message: string }
  | { readonly ok: false; readonly message: string };
