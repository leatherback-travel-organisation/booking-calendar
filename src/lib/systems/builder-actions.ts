"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSystemsOperator } from "@/lib/access/systems-port";
import { databaseConfigured } from "@/lib/db/neon";
import { identityMode, requireEmployeeIdentity } from "@/lib/identity/server";
import type { BuilderCodeGenerationResult, BuilderCodeRevocationResult } from "./builder-codes";
import { generatePostgresBuilderCode, revokePostgresBuilderCode } from "./builder-codes";

const generateBuilderCodeSchema = z.object({
  requestId: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  expiresInDays: z.number().int().min(1).max(30),
});

const revokeBuilderCodeSchema = z.object({
  requestId: z.string().uuid(),
  codeId: z.string().uuid(),
});

export async function generateBuilderCode(input: unknown): Promise<BuilderCodeGenerationResult> {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("App-builder codes are available only in the authenticated live environment.");
    const value = generateBuilderCodeSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const actor = await requireSystemsOperator(identity);
    const result = await generatePostgresBuilderCode({ ...value, actorUserId: actor.userId });
    revalidatePath("/systems/app-builder");
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("The invitation code could not be generated.");
    console.error("[systems-builder-action] failed", { action: "generate-builder-code", message: error.message });
    return { ok: false, message: error.message };
  }
}

export async function revokeBuilderCode(input: unknown): Promise<BuilderCodeRevocationResult> {
  try {
    if (identityMode() !== "clerk" || !databaseConfigured()) throw new Error("App-builder codes are available only in the authenticated live environment.");
    const value = revokeBuilderCodeSchema.parse(input);
    const identity = await requireEmployeeIdentity();
    const actor = await requireSystemsOperator(identity);
    const result = await revokePostgresBuilderCode({ ...value, actorUserId: actor.userId });
    revalidatePath("/systems/app-builder");
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("The invitation code could not be revoked.");
    console.error("[systems-builder-action] failed", { action: "revoke-builder-code", message: error.message });
    return { ok: false, message: error.message };
  }
}
