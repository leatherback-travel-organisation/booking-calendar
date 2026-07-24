"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { provisionApplicationAccess, requireSystemsOperator } from "@/lib/access/systems-port";
import { databaseConfigured } from "@/lib/db/neon";
import { identityMode, requireEmployeeIdentity } from "@/lib/identity/server";
import type { ManagedAssetRegistrationResult, ManagedAssetUpdateResult } from "./model";
import { assetSlug, existingAssetRegistrationSchema, managedAssetProfileUpdateSchema, parseCompanyRepositoryUrl, parseProductionUrl } from "./registration";
import { registerPostgresApplicationAsset, registerPostgresWebsiteAsset, updatePostgresManagedAsset } from "./postgres";
import { approveCoveSsoIntegration, prepareCoveSsoIntegration, refreshCoveSsoIntegration } from "./sso-service";

const ssoWorkflowActionSchema = z.object({
  assetId: z.string().uuid(),
  requestId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export async function registerExistingAsset(input: unknown): Promise<ManagedAssetRegistrationResult> {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("Systems changes are disabled outside the authenticated live environment.");
    const value = existingAssetRegistrationSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const actor = await requireSystemsOperator(identity);
    const slug = assetSlug(value.name);
    const repository = value.repositoryUrl ? parseCompanyRepositoryUrl(value.repositoryUrl) : null;
    const productionUrl = parseProductionUrl(value.productionUrl);

    if (value.assetKind === "application") {
      const registered = await provisionApplicationAccess(identity, {
          requestId: value.requestId,
          slug,
          name: value.name,
          description: value.description,
          launchUrl: productionUrl,
          ownerUserId: value.productOwnerUserId,
          memberUserIds: value.teamMemberUserIds,
          employeeAccessPolicy: value.employeeAccessPolicy,
        }, (command) => registerPostgresApplicationAsset(command, {
          risk: value.risk,
          repositoryPath: repository?.path ?? null,
          repositoryUrl: repository?.href ?? null,
        }));
      revalidatePath("/");
      revalidatePath("/systems");
      return {
        ok: true,
        assetId: registered.assetId,
        applicationId: registered.applicationId,
        message: `${value.name} has been registered in SuperPanel.`,
      };
    }

    const asset = await registerPostgresWebsiteAsset({
      ...value,
      assetKind: "website",
      slug,
      repositoryPath: repository?.path ?? null,
      repositoryUrl: repository?.href ?? null,
      productionUrl,
      actorUserId: actor.userId,
    });
    revalidatePath("/");
    revalidatePath("/systems");
    return {
      ok: true,
      assetId: asset.assetId,
      message: asset.duplicate ? "This registration was already processed." : `${value.name} has been registered in SuperPanel.`,
    };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("The asset could not be registered.");
    console.error("[systems-action] failed", { action: "register-existing-asset", message: error.message, stack: error.stack });
    return { ok: false, message: error.message };
  }
}

export async function updateManagedAsset(input: unknown): Promise<ManagedAssetUpdateResult> {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("Systems changes are disabled outside the authenticated live environment.");
    const value = managedAssetProfileUpdateSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const actor = await requireSystemsOperator(identity);
    const repository = value.repositoryUrl ? parseCompanyRepositoryUrl(value.repositoryUrl) : null;
    const productionUrl = parseProductionUrl(value.productionUrl);
    const updated = await updatePostgresManagedAsset({
      ...value,
      repositoryPath: repository?.path ?? null,
      repositoryUrl: repository?.href ?? null,
      productionUrl,
      actorUserId: actor.userId,
    });
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/systems");
    return {
      ok: true,
      assetId: value.assetId,
      message: updated.duplicate ? "This profile update was already processed." : `${value.name} has been updated.`,
    };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("The asset profile could not be updated.");
    console.error("[systems-action] failed", { action: "update-managed-asset", message: error.message, stack: error.stack });
    return { ok: false, message: error.message };
  }
}

export async function prepareApplicationSso(input: unknown) {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("SSO preparation is available only in the authenticated live environment.");
    const value = ssoWorkflowActionSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const result = await prepareCoveSsoIntegration(identity, value);
    revalidatePath("/");
    revalidatePath("/systems");
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Cove could not prepare shared sign-in.");
    console.error("[systems-sso-action] failed", { action: "prepare", message: error.message });
    return { ok: false as const, message: error.message };
  }
}

export async function refreshApplicationSso(input: unknown) {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("SSO checks are available only in the authenticated live environment.");
    const value = ssoWorkflowActionSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const result = await refreshCoveSsoIntegration(identity, value);
    revalidatePath("/");
    revalidatePath("/systems");
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Cove could not refresh shared sign-in evidence.");
    console.error("[systems-sso-action] failed", { action: "refresh", message: error.message });
    return { ok: false as const, message: error.message };
  }
}

export async function approveApplicationSso(input: unknown) {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("SSO approval is available only in the authenticated live environment.");
    const value = ssoWorkflowActionSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const result = await approveCoveSsoIntegration(identity, value);
    revalidatePath("/");
    revalidatePath("/systems");
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Cove could not approve shared sign-in.");
    console.error("[systems-sso-action] failed", { action: "approve", message: error.message });
    return { ok: false as const, message: error.message };
  }
}
