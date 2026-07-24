import type { DataOrigin } from "@/lib/airtable/model";
import { isIsoCalendarDateOnOrBefore } from "../integrity/date.ts";

export type MoneyKind = "invoice" | "travel_credit" | "reimbursement";

export type MoneyStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "action_required"
  | "approved"
  | "scheduled"
  | "paid"
  | "available"
  | "used"
  | "declined";

export type MoneyRecord = {
  id: string;
  kind: MoneyKind;
  reference: string;
  employeeName: string;
  employeeEmail: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  status: MoneyStatus;
  submittedAt: string;
  updatedAt: string;
  transactionDate?: string;
  dueDate?: string;
  counterparty?: string;
  category?: string;
  attachmentUrl?: string;
  adminNote?: string;
};

export type MoneyCollection = {
  items: MoneyRecord[];
  origin: DataOrigin;
  integrityIssues: number;
};

export type NewMoneyRequest = {
  kind: "invoice" | "reimbursement" | "travel_credit";
  title: string;
  description: string;
  amount: number;
  currency: string;
  counterparty?: string;
  category?: string;
  transactionDate?: string;
  dueDate?: string;
  invoiceNumber?: string;
};

export type MoneyAttachment = {
  filename: string;
  contentType: string;
  base64: string;
};

export type MoneyMutationResult = {
  record: MoneyRecord;
  persisted: boolean;
};

export type MoneyReviewTarget = Pick<MoneyRecord, "id" | "kind" | "status" | "updatedAt">;

export const moneyStatusTransitions: Readonly<Record<MoneyKind, Readonly<Record<MoneyStatus, readonly MoneyStatus[]>>>> = {
  invoice: {
    draft: ["submitted"],
    submitted: ["in_review", "action_required", "approved", "declined"],
    in_review: ["action_required", "approved", "declined"],
    action_required: ["in_review", "approved", "declined"],
    approved: ["scheduled"],
    scheduled: ["paid"],
    paid: [], available: [], used: [], declined: [],
  },
  reimbursement: {
    draft: ["submitted"],
    submitted: ["in_review", "action_required", "approved", "declined"],
    in_review: ["action_required", "approved", "declined"],
    action_required: ["in_review", "approved", "declined"],
    approved: ["scheduled"],
    scheduled: ["paid"],
    paid: [], available: [], used: [], declined: [],
  },
  travel_credit: {
    available: ["used", "declined"],
    used: [], declined: [], draft: [], submitted: [], in_review: [], action_required: [], approved: [], scheduled: [], paid: [],
  },
};

export function isAllowedMoneyStatusTransition(
  kind: MoneyKind,
  currentStatus: MoneyStatus,
  nextStatus: MoneyStatus,
): boolean {
  const transitionMap = moneyStatusTransitions as Partial<
    Record<MoneyKind, Partial<Record<MoneyStatus, readonly MoneyStatus[]>>>
  >;
  const allowed = transitionMap[kind]?.[currentStatus];
  return Boolean(allowed && (currentStatus === nextStatus || allowed.includes(nextStatus)));
}

export function isValidMoneyTransactionDate(value: string | undefined, now = new Date()): boolean {
  return !value || isIsoCalendarDateOnOrBefore(value, now);
}

export function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

const moneyStatusAliases: Readonly<Record<string, MoneyStatus>> = {
  pending: "submitted",
  processing: "in_review",
  review: "in_review",
  needs_info: "action_required",
  needs_information: "action_required",
  requires_action: "action_required",
  payment_scheduled: "scheduled",
  complete: "paid",
  completed: "paid",
  active: "available",
  redeemed: "used",
  rejected: "declined",
};

const statusesByKind: Readonly<Record<MoneyKind, ReadonlySet<MoneyStatus>>> = {
  invoice: new Set(["draft", "submitted", "in_review", "action_required", "approved", "scheduled", "paid", "declined"]),
  reimbursement: new Set(["draft", "submitted", "in_review", "action_required", "approved", "scheduled", "paid", "declined"]),
  travel_credit: new Set(["available", "used", "declined"]),
};

/** Normalizes known Airtable labels while rejecting unknown or incompatible states. */
export function parseMoneyStatus(value: unknown, kind: MoneyKind): MoneyStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const candidate = moneyStatusAliases[normalized] ?? normalized;
  return statusesByKind[kind].has(candidate as MoneyStatus) ? candidate as MoneyStatus : null;
}

/** Keeps legacy workflow metadata internal without making it a display requirement. */
export function moneyStatusForDisplay(value: unknown, kind: MoneyKind): MoneyStatus {
  return parseMoneyStatus(value, kind) ?? (kind === "travel_credit" ? "available" : "submitted");
}
