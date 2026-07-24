import "server-only";

import { databaseConfigured } from "@/lib/db/neon";
import { identityMode } from "@/lib/identity/server";
import { previewAccessSnapshot } from "@/lib/access/preview-data";
import type { ManagedAsset } from "./model";
import { getPostgresManagedAssets } from "./postgres";

const previewAssets: readonly ManagedAsset[] = previewAccessSnapshot.applications.map((application) => ({
  id: `asset-${application.id}`,
  assetKind: "application",
  applicationId: application.id,
  slug: application.slug,
  name: application.name,
  description: application.description,
  productOwnerUserId: "user-operations",
  productOwnerName: application.owner,
  memberUserIds: [],
  repository: application.repository,
  productionUrl: application.launchUrl,
  risk: application.risk,
  status: application.status,
  employeeAccessPolicy: application.employeeAccessPolicy ?? "selected",
}));

export async function getManagedAssets(): Promise<readonly ManagedAsset[]> {
  if (identityMode() === "preview") return previewAssets;
  if (!databaseConfigured()) throw new Error("The systems registry is unavailable.");
  return getPostgresManagedAssets();
}
