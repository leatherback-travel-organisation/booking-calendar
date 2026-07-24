"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { identityMode } from "@/lib/identity/server";
import { databaseConfigured } from "@/lib/db/neon";
import { getAccessDirectory, requirePlatformRole } from "./server";
import {
  invitePostgresUser,
  updatePostgresApplicationAccess,
  updatePostgresPlatformRole,
  updatePostgresUserStatus,
} from "./postgres";
import type { AccessActionResult } from "./admin-model";
import type { MutationOutcome } from "./mutations";
import { SUPERPANEL_APPLICATION_SLUG } from "./application-ids";

const employeeEmail = z.string().trim().toLowerCase().email().refine((email) => email.endsWith("@leatherbacktravel.com"), "Use a Leatherback Travel work email.");
const id = z.string().uuid();
const mutationRequest = z.string().uuid();

async function accessActor() {
  if (identityMode() !== "clerk" || !databaseConfigured()) {
    throw new Error("Access changes are disabled outside the authenticated live environment.");
  }
  const identity = await requireEmployeeIdentity();
  const user = await requirePlatformRole(identity, ["super_admin", "access_admin"]);
  return user;
}

async function success(message: string): Promise<AccessActionResult> {
  revalidatePath("/admin");
  return { ok: true, directory: await getAccessDirectory(), message };
}

function failure(action: string, cause: unknown): AccessActionResult {
  const error = cause instanceof Error ? cause : new Error("The access change could not be saved.");
  console.error("[access-action] failed", {
    action,
    message: error.message,
    stack: error.stack,
  });
  return { ok: false, message: error.message };
}

function mutationMessage(outcome: MutationOutcome, changed: string, unchanged: string) {
  if (outcome === "duplicate") return "This access change was already processed.";
  return outcome === "changed" ? changed : unchanged;
}

export async function inviteAccessUser(input: unknown): Promise<AccessActionResult> {
  try {
    const value = z.object({ name: z.string().trim().min(2).max(120), email: employeeEmail, requestId: mutationRequest }).parse(input);
    const user = await accessActor();
    const created = await invitePostgresUser({ ...value, actorUserId: user.id });
    return success(created ? `${value.name} has been invited for 14 days.` : "This invitation was already processed.");
  } catch (cause) {
    return failure("invite-user", cause);
  }
}

export async function changeAccessUserStatus(input: unknown): Promise<AccessActionResult> {
  try {
    const value = z.object({ userId: id, status: z.enum(["active", "suspended"]), requestId: mutationRequest }).parse(input);
    const user = await accessActor();
    if (user.id === value.userId && value.status === "suspended") throw new Error("You cannot suspend your own administrator account.");
    const outcome = await updatePostgresUserStatus({ ...value, actorUserId: user.id });
    return success(mutationMessage(
      outcome,
      value.status === "suspended" ? "Access has been suspended and existing sessions invalidated." : "Access has been restored.",
      value.status === "suspended" ? "Access was already suspended." : "Access was already active.",
    ));
  } catch (cause) {
    return failure("change-user-status", cause);
  }
}

export async function changePlatformAdmin(input: unknown): Promise<AccessActionResult> {
  try {
    const value = z.object({ userId: id, enabled: z.boolean(), requestId: mutationRequest }).parse(input);
    const user = await accessActor();
    if (user.id === value.userId && !value.enabled) throw new Error("You cannot remove your own administrator access.");
    const outcome = await updatePostgresPlatformRole({ ...value, role: "access_admin", actorUserId: user.id });
    return success(mutationMessage(
      outcome,
      value.enabled ? "Administrator access has been granted." : "Administrator access has been removed.",
      value.enabled ? "Administrator access was already granted." : "Administrator access was already absent.",
    ));
  } catch (cause) {
    return failure("change-platform-admin", cause);
  }
}

export async function changeSystemsAccess(input: unknown): Promise<AccessActionResult> {
  try {
    const value = z.object({ userId: id, enabled: z.boolean(), requestId: mutationRequest }).parse(input);
    const user = await accessActor();
    const outcome = await updatePostgresPlatformRole({ ...value, role: "systems_admin", actorUserId: user.id });
    return success(mutationMessage(
      outcome,
      value.enabled ? "SuperPanel systems access has been granted." : "SuperPanel systems access has been removed.",
      value.enabled ? "SuperPanel systems access was already granted." : "SuperPanel systems access was already absent.",
    ));
  } catch (cause) {
    return failure("change-systems-access", cause);
  }
}

export async function changeApplicationAccess(input: unknown): Promise<AccessActionResult> {
  try {
    const value = z.object({ userId: id, applicationSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), level: z.enum(["user", "admin"]).nullable(), requestId: mutationRequest }).parse(input);
    if (value.applicationSlug === SUPERPANEL_APPLICATION_SLUG) {
      throw new Error("SuperPanel access is managed through Systems team membership.");
    }
    const user = await accessActor();
    const outcome = await updatePostgresApplicationAccess({ ...value, actorUserId: user.id });
    return success(mutationMessage(
      outcome,
      value.level ? `${value.applicationSlug} ${value.level} access has been saved.` : `${value.applicationSlug} access has been removed.`,
      value.level ? `${value.applicationSlug} ${value.level} access was already assigned.` : `${value.applicationSlug} access was already absent.`,
    ));
  } catch (cause) {
    return failure("change-application-access", cause);
  }
}
