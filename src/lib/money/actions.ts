"use server";

import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { createMoneyRequest, updateMoneyReview } from "./server";
import {
  isAllowedMoneyStatusTransition,
  moneyStatusTransitions,
  type MoneyReviewTarget,
  type MoneyStatus,
  type NewMoneyRequest,
} from "./model";
import { validateNewMoneyRequest } from "./validation";
const reviewStatuses = new Set<MoneyStatus>(["submitted", "in_review", "action_required", "approved", "scheduled", "paid", "available", "used", "declined"]);

function cleanText(value: string, max: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export async function submitMoneyRequest(input: NewMoneyRequest) {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "money", "money.submit");
  return createMoneyRequest(validateNewMoneyRequest(input), { name: identity.displayName, email: identity.email });
}

export async function reviewMoneyRequest(target: MoneyReviewTarget, status: MoneyStatus, note: string) {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "money", "money.review");
  if (!reviewStatuses.has(status)) throw new Error("Unsupported review status.");
  if (!target.id || !target.kind || !target.status || !target.updatedAt) throw new Error("Invalid money record.");
  if (!moneyStatusTransitions[target.kind]) throw new Error("Invalid money record type.");
  if (!isAllowedMoneyStatusTransition(target.kind, target.status, status)) throw new Error("That status change is not allowed.");
  return updateMoneyReview(target, status, cleanText(note, 1000));
}
