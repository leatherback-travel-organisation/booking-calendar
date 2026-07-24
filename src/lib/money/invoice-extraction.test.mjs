import assert from "node:assert/strict";
import test from "node:test";

import { extractInvoiceFields } from "./invoice-extraction.ts";

test("invoice extraction finds reviewable supplier, number, dates, and total", () => {
  const result = extractInvoiceFields(`
Leatherback Consulting Ltd
INVOICE
Invoice No: LB-2048
Invoice Date: 15 July 2026
Due Date: 31 July 2026
Services 3,500.00
VAT 350.00
Amount Due USD 3,850.00
  `);

  assert.deepEqual(result, {
    title: "Invoice LB-2048",
    invoiceNumber: "LB-2048",
    amount: 3850,
    currency: "USD",
    counterparty: "Leatherback Consulting Ltd",
    transactionDate: "2026-07-15",
    dueDate: "2026-07-31",
  });
});

test("invoice extraction does not invent a missing amount", () => {
  const result = extractInvoiceFields("INVOICE\nCove Studio\nDate: 2026-07-14", "cove-july.pdf");
  assert.equal(result.amount, null);
  assert.equal(result.title, "Invoice from Cove Studio");
  assert.equal(result.transactionDate, "2026-07-14");
});

test("invoice extraction handles PDFs that return the whole page on one line", () => {
  const result = extractInvoiceFields("Leatherback Consulting Ltd INVOICE Invoice No: LB-2048 Invoice Date: 15 July 2026 Due Date: 31 July 2026 Contractor services USD 3,500.00 VAT USD 350.00 Amount Due USD 3,850.00");
  assert.equal(result.counterparty, "Leatherback Consulting Ltd");
  assert.equal(result.amount, 3850);
  assert.equal(result.transactionDate, "2026-07-15");
  assert.equal(result.dueDate, "2026-07-31");
});
