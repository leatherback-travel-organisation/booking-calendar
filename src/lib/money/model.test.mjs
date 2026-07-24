import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAtMostTwoDecimalPlaces,
  isAllowedMoneyStatusTransition,
  isValidMoneyTransactionDate,
  moneyStatusForDisplay,
  moneyStatusTransitions,
  parseMoneyStatus,
} from "./model.ts";

test("money approvals follow controlled forward-only transitions", () => {
  assert.deepEqual(moneyStatusTransitions.invoice.approved, ["scheduled"]);
  assert.deepEqual(moneyStatusTransitions.invoice.scheduled, ["paid"]);
  assert.deepEqual(moneyStatusTransitions.invoice.paid, []);
  assert.equal(moneyStatusTransitions.invoice.submitted.includes("paid"), false);
});

test("travel credits cannot enter invoice workflow states", () => {
  assert.deepEqual(moneyStatusTransitions.travel_credit.available, ["used", "declined"]);
  assert.deepEqual(moneyStatusTransitions.travel_credit.used, []);
});

test("status validation permits note-only saves and rejects skipped workflow states", () => {
  assert.equal(isAllowedMoneyStatusTransition("invoice", "submitted", "submitted"), true);
  assert.equal(isAllowedMoneyStatusTransition("invoice", "submitted", "approved"), true);
  assert.equal(isAllowedMoneyStatusTransition("invoice", "submitted", "paid"), false);
  assert.equal(isAllowedMoneyStatusTransition("travel_credit", "available", "paid"), false);
  assert.equal(isAllowedMoneyStatusTransition("invoice", "unknown", "unknown"), false);
});

test("money dates reject calendar rollover and future dates", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(isValidMoneyTransactionDate(undefined, now), true);
  assert.equal(isValidMoneyTransactionDate("2026-07-15", now), true);
  assert.equal(isValidMoneyTransactionDate("2026-02-29", now), false);
  assert.equal(isValidMoneyTransactionDate("2026-07-16", now), false);
});

test("money values are limited to currency precision", () => {
  assert.equal(hasAtMostTwoDecimalPlaces(19.99), true);
  assert.equal(hasAtMostTwoDecimalPlaces(19.999), false);
});

test("source statuses normalize known labels and reject invented workflow state", () => {
  assert.equal(parseMoneyStatus("Payment scheduled", "invoice"), "scheduled");
  assert.equal(parseMoneyStatus("active", "travel_credit"), "available");
  assert.equal(parseMoneyStatus("available", "invoice"), null);
  assert.equal(parseMoneyStatus("paid", "travel_credit"), null);
  assert.equal(parseMoneyStatus("unknown", "invoice"), null);
  assert.equal(parseMoneyStatus(undefined, "invoice"), null);
});

test("employee display does not depend on finance workflow status", () => {
  assert.equal(moneyStatusForDisplay(undefined, "invoice"), "submitted");
  assert.equal(moneyStatusForDisplay("not configured", "reimbursement"), "submitted");
  assert.equal(moneyStatusForDisplay(undefined, "travel_credit"), "available");
  assert.equal(moneyStatusForDisplay("paid", "invoice"), "paid");
});
