import { parseIsoCalendarDate } from "../integrity/date.ts";

export type ExtractedInvoice = {
  title: string;
  invoiceNumber: string;
  amount: number | null;
  currency: string;
  counterparty: string;
  transactionDate: string;
  dueDate: string;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function isoDate(year: number, month: number, day: number) {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return parseIsoCalendarDate(value) ? value : "";
}

function parseDate(value: string) {
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(value);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*,?\s*(20\d{2})\b/i.exec(value);
  if (dayFirst) return isoDate(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));

  const monthFirst = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})\b/i.exec(value);
  if (monthFirst) return isoDate(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]));

  const numeric = /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/.exec(value);
  if (!numeric) return "";
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  const day = first > 12 ? first : second > 12 ? second : first;
  const month = first > 12 ? second : second > 12 ? first : second;
  return isoDate(Number(numeric[3]), month, day);
}

function amountValue(value: string) {
  const normalized = value.replace(/\s/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  let decimal = normalized;

  if (lastComma > lastDot && normalized.length - lastComma === 3) {
    decimal = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    decimal = normalized.replace(/,/g, "");
  }

  const amount = Number(decimal.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function firstLabeledLine(lines: string[], labels: RegExp) {
  return lines.find((line) => labels.test(line)) ?? "";
}

function findCounterparty(lines: string[]) {
  const beforeInvoice = lines.join(" ").split(/\b(?:tax\s+)?invoice\b/i)[0].trim();
  if (beforeInvoice.length >= 2 && beforeInvoice.length <= 120 && /[a-z]/i.test(beforeInvoice)) return beforeInvoice;

  const explicit = firstLabeledLine(lines, /^(?:from|supplier|vendor|issued by)\s*:/i)
    .replace(/^(?:from|supplier|vendor|issued by)\s*:\s*/i, "").trim();
  if (explicit) return explicit.slice(0, 120);

  return (lines.find((line) => {
    if (line.length < 2 || line.length > 80 || !/[a-z]/i.test(line)) return false;
    if (/^(invoice|tax invoice|bill to|billed to|date|due date|invoice date|invoice no|number|description|qty|quantity|rate|amount|subtotal|tax|vat|total|balance|payment|bank|email|phone|address)\b/i.test(line)) return false;
    return !/\b(?:20\d{2}|www\.|@)\b/i.test(line) && !/^[$€£]?\s*[\d.,]+$/.test(line);
  }) ?? "").slice(0, 120);
}

export function extractInvoiceFields(text: string, filename = "invoice.pdf"): ExtractedInvoice {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const flattened = lines.join("\n");
  const invoiceNumber = (/(?:invoice\s*(?:number|no\.?|#)|inv\s*(?:number|no\.?|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{1,30})/i.exec(flattened)?.[1] ?? "").trim();

  const preferredTotal = /(?:amount\s+due|balance\s+due|grand\s+total|invoice\s+total)\b([\s\S]{0,45})/i.exec(flattened)?.[1];
  const fallbackTotal = /\btotal\b([\s\S]{0,45})/i.exec(flattened)?.[1];
  const totalLine = preferredTotal ?? fallbackTotal ?? "";
  const amountMatch = /(?:USD|EUR|GBP|ZAR|BWP|KES|TZS|UGX|[$€£R])?\s*((?:\d{1,3}(?:[ ,.]\d{3})+|\d+)(?:[.,]\d{2}))/i.exec(totalLine);
  const amount = amountMatch ? amountValue(amountMatch[1]) : null;

  const currencySource = `${totalLine} ${flattened}`;
  const currency = (/\b(USD|EUR|GBP|ZAR|BWP|KES|TZS|UGX)\b/i.exec(currencySource)?.[1]?.toUpperCase())
    ?? (currencySource.includes("€") ? "EUR" : currencySource.includes("£") ? "GBP" : /\bR\s*\d/.test(currencySource) ? "ZAR" : "USD");

  const invoiceDateLine = /(?:invoice\s+)?date\s*:\s*([\s\S]{0,35})/i.exec(flattened)?.[1] ?? "";
  const dueDateLine = /(?:payment\s+)?due(?:\s+date)?\s*:\s*([\s\S]{0,35})/i.exec(flattened)?.[1] ?? "";
  const transactionDate = parseDate(invoiceDateLine) || parseDate(flattened);
  const dueDate = parseDate(dueDateLine);
  const counterparty = findCounterparty(lines);
  const fallbackName = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const title = invoiceNumber ? `Invoice ${invoiceNumber}` : counterparty ? `Invoice from ${counterparty}` : fallbackName || "Invoice";

  return { title, invoiceNumber, amount, currency, counterparty, transactionDate, dueDate };
}
