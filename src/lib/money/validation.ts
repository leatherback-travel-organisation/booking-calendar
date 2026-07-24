import { parseIsoCalendarDate } from "@/lib/integrity/date";
import {
  hasAtMostTwoDecimalPlaces,
  isValidMoneyTransactionDate,
  type NewMoneyRequest,
} from "./model";

const currencies = new Set(["USD", "EUR", "GBP", "ZAR", "BWP", "KES", "TZS", "UGX"]);

function cleanText(value: string | undefined, max: number) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function validateNewMoneyRequest(input: NewMoneyRequest): NewMoneyRequest {
  if (input.kind !== "invoice" && input.kind !== "reimbursement" && input.kind !== "travel_credit") throw new Error("Unsupported money request type.");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000) throw new Error("Enter a valid amount.");
  if (!hasAtMostTwoDecimalPlaces(input.amount)) throw new Error("Amounts can have no more than two decimal places.");
  const title = cleanText(input.title, 120);
  if (title.length < 3) throw new Error("Add a short title.");
  const currency = input.currency.toUpperCase();
  if (!currencies.has(currency)) throw new Error("Choose a supported currency.");
  if (input.kind === "travel_credit") {
    const travelDate = input.transactionDate ? parseIsoCalendarDate(input.transactionDate) : null;
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (!travelDate || travelDate.valueOf() < today) throw new Error("Choose a valid travel date that is not in the past.");
  } else if (!isValidMoneyTransactionDate(input.transactionDate)) {
    throw new Error("Choose a valid transaction date that is not in the future.");
  }
  if (input.dueDate && !parseIsoCalendarDate(input.dueDate)) throw new Error("Choose a valid due date.");

  return {
    ...input,
    title,
    currency,
    description: cleanText(input.description, 1000),
    counterparty: cleanText(input.counterparty, 120),
    category: cleanText(input.category, 80),
    invoiceNumber: cleanText(input.invoiceNumber, 40),
  };
}
