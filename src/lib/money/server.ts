import "server-only";

import { randomUUID } from "node:crypto";
import { identityMode } from "@/lib/identity/server";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import { previewMoneyRecords } from "./preview-data";
import { isIsoOperationalDate } from "@/lib/integrity/date";
import type {
  MoneyCollection,
  MoneyAttachment,
  MoneyKind,
  MoneyMutationResult,
  MoneyRecord,
  MoneyReviewTarget,
  MoneyStatus,
  NewMoneyRequest,
} from "./model";
import { isAllowedMoneyStatusTransition, moneyStatusForDisplay } from "./model";

type AirtableRecord = { id: string; fields: Record<string, unknown>; createdTime?: string };
type AirtableResponse = { records?: AirtableRecord[]; offset?: string };

const TABLE_ENV: Record<MoneyKind, string> = {
  invoice: "AIRTABLE_INVOICES_TABLE",
  travel_credit: "AIRTABLE_TRAVEL_CREDITS_TABLE",
  reimbursement: "AIRTABLE_REIMBURSEMENTS_TABLE",
};

const DEFAULT_TABLE: Record<MoneyKind, string> = {
  invoice: "Invoices - Euro Team",
  travel_credit: "Travel Credits",
  reimbursement: "Reimbursements",
};

const DEFAULT_TITLE: Record<MoneyKind, string> = {
  invoice: "Invoice",
  travel_credit: "Travel credit",
  reimbursement: "Reimbursement",
};

const SUPPORTED_CURRENCIES = new Set(["USD", "EUR", "GBP", "ZAR", "BWP", "KES", "TZS", "UGX"]);

function config() {
  return {
    token: process.env.AIRTABLE_MONEY_TOKEN || process.env.AIRTABLE_HR_TOKEN,
    baseId: process.env.AIRTABLE_MONEY_BASE_ID || process.env.AIRTABLE_HR_BASE_ID || "appYP9nVmzqan2PlU",
    peopleTable: process.env.AIRTABLE_DIRECTORY_TABLE || "tblJ6mB7XXWnMbezL",
    employeeField: process.env.AIRTABLE_MONEY_EMPLOYEE_FIELD || "Name",
    emailField: process.env.AIRTABLE_MONEY_EMAIL_FIELD || "Employee Email",
    nameField: process.env.AIRTABLE_MONEY_NAME_FIELD || "Employee Name",
    titleField: process.env.AIRTABLE_MONEY_TITLE_FIELD || "Title",
    amountField: process.env.AIRTABLE_MONEY_AMOUNT_FIELD || "Amount",
    currencyField: process.env.AIRTABLE_MONEY_CURRENCY_FIELD || "Currency",
    statusField: process.env.AIRTABLE_MONEY_STATUS_FIELD || "Status",
    submittedField: process.env.AIRTABLE_MONEY_SUBMITTED_FIELD || "Submitted At",
    descriptionField: process.env.AIRTABLE_MONEY_DESCRIPTION_FIELD || "Description",
    notesField: process.env.AIRTABLE_MONEY_ADMIN_NOTE_FIELD || "Admin Notes",
    attachmentFieldId: process.env.AIRTABLE_MONEY_ATTACHMENT_FIELD_ID,
    writesEnabled: process.env.AIRTABLE_MONEY_WRITES_ENABLED === "true",
  };
}

function tableFor(kind: MoneyKind) {
  return process.env[TABLE_ENV[kind]] || DEFAULT_TABLE[kind];
}

function firstField(fields: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function textValue(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.map((item) => textValue(item)).find(Boolean);
    return first || fallback;
  }
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") return value.name.trim();
  return fallback;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateValue(value: unknown, fallback: string) {
  if (value !== undefined && value !== null && value !== "") {
    return typeof value === "string" && isIsoOperationalDate(value) ? value : null;
  }
  return isIsoOperationalDate(fallback) ? fallback : null;
}

function optionalDateValue(value: unknown): string | undefined | null {
  const text = textValue(value);
  if (!text) return undefined;
  return isIsoOperationalDate(text) ? text : null;
}

function attachmentUrl(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return undefined;
  const first = value[0];
  if (!first || typeof first !== "object" || !("url" in first) || typeof first.url !== "string") return null;
  try {
    const url = new URL(first.url);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function recordFromAirtable(kind: MoneyKind, record: AirtableRecord): MoneyRecord | null {
  if (!record.id || !record.fields || typeof record.fields !== "object") return null;
  const { fields } = record;
  const created = record.createdTime || "";
  const reference = textValue(firstField(fields, ["Reference", "Reference Number", "Invoice Number", "ID"]), record.id);
  const amount = numberValue(firstField(fields, ["Amount", "Value", "Total", "Balance"]));
  const currency = textValue(firstField(fields, ["Currency", "Currency Code"])).toUpperCase();
  const status = moneyStatusForDisplay(textValue(firstField(fields, ["Status", "Payment Status", "Approval Status"])), kind);
  const submittedAt = dateValue(firstField(fields, ["Submitted At", "Submitted", "Created", "Date Submitted"]), created);
  const updatedAt = dateValue(firstField(fields, ["Updated At", "Last Modified", "Reviewed At", "Paid At"]), created);
  const transactionDate = optionalDateValue(firstField(fields, ["Transaction Date", "Expense Date", "Travel Date", "Date"]));
  const dueDate = optionalDateValue(firstField(fields, ["Due Date", "Expiry Date", "Expires On", "Valid Until"]));
  const attachment = attachmentUrl(firstField(fields, ["Attachment", "Attachments", "Receipt", "Invoice File"]));
  if (amount === null || amount < 0 || !SUPPORTED_CURRENCIES.has(currency) || !submittedAt || !updatedAt || transactionDate === null || dueDate === null || attachment === null) return null;
  return {
    id: record.id,
    kind,
    reference,
    employeeName: textValue(firstField(fields, ["Employee Name", "Name", "Submitted By", "Team Member"]), "Leatherback teammate"),
    employeeEmail: textValue(firstField(fields, ["Employee Email", "Company Email", "Email", "Submitted By Email"])).toLowerCase(),
    title: textValue(firstField(fields, ["Title", "Description", "Invoice Name", "Expense", "Credit Name"]), `${DEFAULT_TITLE[kind]} ${reference}`),
    description: textValue(firstField(fields, ["Description", "Details", "Notes"])) || undefined,
    amount,
    currency,
    status,
    submittedAt,
    updatedAt,
    transactionDate,
    dueDate,
    counterparty: textValue(firstField(fields, ["Counterparty", "Vendor", "Supplier", "Paid To"])) || undefined,
    category: textValue(firstField(fields, ["Category", "Type", "Expense Type"])) || undefined,
    attachmentUrl: attachment,
    adminNote: textValue(firstField(fields, ["Admin Notes", "Reviewer Notes", "Finance Notes"])) || undefined,
  };
}

function escapeFormula(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findEmployee(employeeEmail: string) {
  const settings = config();
  if (!settings.token || !settings.baseId) return null;
  const email = escapeFormula(employeeEmail.toLowerCase());
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: `OR(LOWER({Company email})='${email}',LOWER({Email})='${email}')` });
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(settings.peopleTable)}?${query}`, {
    headers: { Authorization: `Bearer ${settings.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Airtable employee lookup failed with status ${response.status}.`);
  const page = (await response.json()) as AirtableResponse;
  const record = page.records?.[0];
  if (!record) return null;
  return { id: record.id, name: textValue(record.fields.Name), email: employeeEmail.toLowerCase() };
}

type AirtableEmployee = { id?: string; name: string; email: string };

async function readTable(kind: MoneyKind, employee?: AirtableEmployee): Promise<AirtableRecord[] | null> {
  const settings = config();
  if (!settings.token || !settings.baseId) return null;
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (offset) query.set("offset", offset);
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(tableFor(kind))}?${query}`, {
      headers: { Authorization: `Bearer ${settings.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Airtable money request failed with status ${response.status}.`);
    const page = (await response.json()) as AirtableResponse;
    records.push(...(page.records ?? []));
    offset = page.offset;
  } while (offset);

  if (!employee) return records;
  return records.filter((record) => {
    const linked = firstField(record.fields, [settings.employeeField, "Name", "Employee", "Employee Name", "Team Member", "Submitted By"]);
    const linkedIds = Array.isArray(linked) ? linked.filter((value): value is string => typeof value === "string") : [];
    const recordEmail = textValue(firstField(record.fields, [settings.emailField, "Employee Email", "Company email", "Company Email", "Email", "Submitted By Email"])).toLowerCase();
    return Boolean(employee.id && linkedIds.includes(employee.id)) || recordEmail === employee.email;
  });
}

async function readMoney(employee?: AirtableEmployee): Promise<MoneyCollection> {
  const kinds = Object.keys(DEFAULT_TABLE) as MoneyKind[];
  const pages = await Promise.all(kinds.map(async (kind) => {
    try {
      const records = await readTable(kind, employee);
      return { kind, records: records ?? [], available: records !== null };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      console.error("[money] Airtable table unavailable", { kind, message: error.message });
      return { kind, records: [], available: false };
    }
  }));
  if (!pages.some((page) => page.available)) {
    return { items: [], origin: "unavailable", integrityIssues: 0 };
  }

  let integrityIssues = 0;
  const items = pages.flatMap(({ kind, records }) => {
    return records.flatMap((record) => {
      const item = recordFromAirtable(kind, record);
      if (!item) {
        integrityIssues += 1;
        return [];
      }
      return [employee ? { ...item, employeeName: employee.name, employeeEmail: employee.email } : item];
    });
  });
  return { items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), origin: "airtable", integrityIssues };
}

function unavailableAirtableMoney(): MoneyCollection {
  return { items: [], origin: "unavailable", integrityIssues: 0 };
}

function reportAirtableReadFailure(scope: "employee" | "admin", cause: unknown) {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  console.error("[money] Airtable records unavailable", {
    scope,
    message: error.message,
  });
}

async function readEmployeeAirtableMoney(employeeEmail: string): Promise<MoneyCollection> {
  try {
    const employee = await findEmployee(employeeEmail);
    const normalizedEmail = employeeEmail.toLowerCase();
    return await readMoney(employee?.name ? employee : {
      email: normalizedEmail,
      name: normalizedEmail.split("@")[0] || "Leatherback teammate",
    });
  } catch (cause) {
    reportAirtableReadFailure("employee", cause);
    return unavailableAirtableMoney();
  }
}

async function readAllAirtableMoney(): Promise<MoneyCollection> {
  try {
    return await readMoney();
  } catch (cause) {
    reportAirtableReadFailure("admin", cause);
    return unavailableAirtableMoney();
  }
}

export async function getEmployeeMoney(employeeEmail: string): Promise<MoneyCollection> {
  if (identityMode() === "preview") {
    return { items: previewMoneyRecords.filter((item) => item.employeeEmail.toLowerCase() === employeeEmail.toLowerCase()), origin: "preview", integrityIssues: 0 } satisfies MoneyCollection;
  }
  const [airtable, databaseItems] = await Promise.all([
    readEmployeeAirtableMoney(employeeEmail),
    readPostgresMoney(employeeEmail),
  ]);
  return {
    items: [...databaseItems, ...airtable.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    origin: airtable.origin === "airtable" ? "airtable" : databaseConfigured() ? "database" : "unavailable",
    integrityIssues: airtable.integrityIssues,
  };
}

export async function getAllMoney(): Promise<MoneyCollection> {
  if (identityMode() === "preview") return Promise.resolve({ items: [...previewMoneyRecords], origin: "preview", integrityIssues: 0 } satisfies MoneyCollection);
  const [airtable, databaseItems] = await Promise.all([readAllAirtableMoney(), readPostgresMoney()]);
  return {
    items: [...databaseItems, ...airtable.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    origin: airtable.origin === "airtable" ? "airtable" : databaseConfigured() ? "database" : "unavailable",
    integrityIssues: airtable.integrityIssues,
  };
}

function previewRecord(input: NewMoneyRequest, employee: { name: string; email: string }): MoneyRecord {
  const now = new Date().toISOString();
  const prefix = input.kind === "invoice" ? "INV" : input.kind === "reimbursement" ? "REI" : "TRIP";
  return {
    id: `preview-${randomUUID()}`,
    kind: input.kind,
    reference: `${prefix}-${String(Date.now()).slice(-5)}`,
    employeeName: employee.name,
    employeeEmail: employee.email,
    title: input.title,
    description: input.description || undefined,
    amount: input.amount,
    currency: input.currency,
    status: "submitted",
    submittedAt: now,
    updatedAt: now,
    transactionDate: input.transactionDate || undefined,
    dueDate: input.dueDate || undefined,
    counterparty: input.counterparty || undefined,
    category: input.category || undefined,
  };
}

export async function createMoneyRequest(
  input: NewMoneyRequest,
  employee: { name: string; email: string },
  attachment?: MoneyAttachment,
): Promise<MoneyMutationResult> {
  const settings = config();
  if (identityMode() === "preview") {
    return { record: previewRecord(input, employee), persisted: false };
  }
  if (!settings.writesEnabled || input.kind === "travel_credit") {
    return createPostgresMoney(input, employee, attachment);
  }
  if (!settings.token || !settings.baseId || !settings.writesEnabled) {
    throw new Error("Money submissions are not configured for this environment.");
  }

  const attachmentFieldId = attachment ? await resolveAttachmentFieldId(input.kind) : null;
  if (attachment && !attachmentFieldId) {
    throw new Error("Invoice attachment storage is not configured. Ask Finance to connect the Airtable attachment field.");
  }

  const now = new Date().toISOString();
  const fields: Record<string, unknown> = {
    [settings.emailField]: employee.email,
    [settings.nameField]: employee.name,
    [settings.titleField]: input.title,
    [settings.amountField]: input.amount,
    [settings.currencyField]: input.currency,
    [settings.statusField]: "Submitted",
    [settings.submittedField]: now,
    [settings.descriptionField]: input.description,
  };
  if (process.env.AIRTABLE_MONEY_COUNTERPARTY_FIELD && input.counterparty) fields[process.env.AIRTABLE_MONEY_COUNTERPARTY_FIELD] = input.counterparty;
  if (process.env.AIRTABLE_MONEY_CATEGORY_FIELD && input.category) fields[process.env.AIRTABLE_MONEY_CATEGORY_FIELD] = input.category;
  if (process.env.AIRTABLE_MONEY_TRANSACTION_DATE_FIELD && input.transactionDate) fields[process.env.AIRTABLE_MONEY_TRANSACTION_DATE_FIELD] = input.transactionDate;
  if (process.env.AIRTABLE_MONEY_DUE_DATE_FIELD && input.dueDate) fields[process.env.AIRTABLE_MONEY_DUE_DATE_FIELD] = input.dueDate;
  if (process.env.AIRTABLE_MONEY_INVOICE_NUMBER_FIELD && input.invoiceNumber) fields[process.env.AIRTABLE_MONEY_INVOICE_NUMBER_FIELD] = input.invoiceNumber;

  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(tableFor(input.kind))}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Airtable money submission failed with status ${response.status}.`);
  const record = (await response.json()) as AirtableRecord;
  const verified = recordFromAirtable(input.kind, record);
  if (!verified) throw new Error("Airtable accepted the submission but returned a record Cove could not verify. Refresh before retrying.");
  if (!attachment || !attachmentFieldId) return { record: verified, persisted: true };

  const upload = await fetch(`https://content.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(attachmentFieldId)}/uploadAttachment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: attachment.contentType, filename: attachment.filename, file: attachment.base64 }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!upload.ok) throw new Error(`The request was created, but Airtable could not attach the document (status ${upload.status}). Ask Finance to attach it before reviewing.`);
  return { record: await getMoneyRecord(input.kind, record.id), persisted: true };
}

const attachmentFieldCache = new Map<MoneyKind, string>();

async function resolveAttachmentFieldId(kind: MoneyKind) {
  const settings = config();
  if (settings.attachmentFieldId) return settings.attachmentFieldId;
  const cached = attachmentFieldCache.get(kind);
  if (cached) return cached;
  if (!settings.token || !settings.baseId) return null;

  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(settings.baseId)}/tables`, {
    headers: { Authorization: `Bearer ${settings.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const schema = (await response.json()) as { tables?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }> };
  const configuredTable = tableFor(kind);
  const table = schema.tables?.find((item) => item.id === configuredTable || item.name === configuredTable);
  const field = table?.fields?.find((item) => item.type === "multipleAttachments" && /attachment|invoice|receipt|file/i.test(item.name))
    ?? table?.fields?.find((item) => item.type === "multipleAttachments");
  if (!field) return null;
  attachmentFieldCache.set(kind, field.id);
  return field.id;
}

export async function updateMoneyReview(
  target: MoneyReviewTarget,
  status: MoneyStatus,
  adminNote: string,
): Promise<MoneyMutationResult> {
  const settings = config();
  if (target.id.startsWith("db:")) return updatePostgresMoneyReview(target, status, adminNote);
  if (identityMode() === "preview" || target.id.startsWith("preview-")) {
    const current = previewMoneyRecords.find((record) => record.id === target.id);
    if (!current) throw new Error("The preview record no longer exists.");
    if (current.kind !== target.kind) throw new Error("The preview record type does not match.");
    if (!isAllowedMoneyStatusTransition(target.kind, target.status, status)) {
      throw new Error(`A ${target.status.replaceAll("_", " ")} record cannot move directly to ${status.replaceAll("_", " ")}.`);
    }
    const updated: MoneyRecord = { ...current, status, adminNote: adminNote || undefined, updatedAt: new Date().toISOString() };
    return { record: updated, persisted: false };
  }
  if (!settings.token || !settings.baseId || !settings.writesEnabled) {
    throw new Error("Money reviews are not configured for this environment.");
  }

  const current = await getMoneyRecord(target.kind, target.id);
  if (current.updatedAt !== target.updatedAt || current.status !== target.status) {
    throw new Error("This record changed after you opened it. Refresh before reviewing it.");
  }
  if (!isAllowedMoneyStatusTransition(current.kind, current.status, status)) {
    throw new Error(`A ${current.status.replaceAll("_", " ")} record cannot move directly to ${status.replaceAll("_", " ")}.`);
  }

  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(tableFor(current.kind))}/${encodeURIComponent(current.id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { [settings.statusField]: status.replaceAll("_", " "), [settings.notesField]: adminNote } }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Airtable money update failed with status ${response.status}.`);
  const record = (await response.json()) as AirtableRecord;
  const verified = recordFromAirtable(current.kind, record);
  if (!verified) throw new Error("Airtable accepted the review but returned a record Cove could not verify. Refresh before retrying.");
  return { record: verified, persisted: true };
}

async function getMoneyRecord(kind: MoneyKind, id: string): Promise<MoneyRecord> {
  const settings = config();
  if (!settings.token || !settings.baseId) throw new Error("The Money data source is unavailable.");
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(tableFor(kind))}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${settings.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) throw new Error("This Money record no longer exists.");
  if (!response.ok) throw new Error(`Airtable money request failed with status ${response.status}.`);
  const record = recordFromAirtable(kind, (await response.json()) as AirtableRecord);
  if (!record) throw new Error("This Money record contains invalid operational data and cannot be reviewed.");
  return record;
}

type PostgresMoneyRow = {
  id: string;
  reference: string;
  employee_name: string;
  employee_email: string;
  kind: "invoice" | "reimbursement" | "travel_credit";
  title: string;
  description: string;
  amount: string | number;
  currency: string;
  status: MoneyStatus;
  transaction_date: string | Date | null;
  due_date: string | Date | null;
  counterparty: string;
  category: string;
  attachment_name: string | null;
  admin_note: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function isoValue(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function calendarValue(value: string | Date | null) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function recordFromPostgres(row: PostgresMoneyRow): MoneyRecord {
  return {
    id: `db:${row.id}`,
    reference: row.reference,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    kind: row.kind,
    title: row.title,
    description: row.description || undefined,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    transactionDate: calendarValue(row.transaction_date),
    dueDate: calendarValue(row.due_date),
    counterparty: row.counterparty || undefined,
    category: row.category || undefined,
    attachmentUrl: row.attachment_name ? `/api/money/attachments/${row.id}` : undefined,
    adminNote: row.admin_note || undefined,
    submittedAt: isoValue(row.created_at),
    updatedAt: isoValue(row.updated_at),
  };
}

async function readPostgresMoney(employeeEmail?: string) {
  if (!databaseConfigured()) return [];
  const sql = getSql();
  const rows = employeeEmail
    ? await sql`select id, reference, employee_name, employee_email, kind, title, description, amount, currency, status, transaction_date, due_date, counterparty, category, attachment_name, admin_note, created_at, updated_at from money_submissions where lower(employee_email) = lower(${employeeEmail}) order by updated_at desc`
    : await sql`select id, reference, employee_name, employee_email, kind, title, description, amount, currency, status, transaction_date, due_date, counterparty, category, attachment_name, admin_note, created_at, updated_at from money_submissions order by updated_at desc`;
  return (rows as PostgresMoneyRow[]).map(recordFromPostgres);
}

async function createPostgresMoney(input: NewMoneyRequest, employee: { name: string; email: string }, attachment?: MoneyAttachment): Promise<MoneyMutationResult> {
  if (!databaseConfigured()) throw new Error("Money submission storage is not configured.");
  if (input.kind !== "travel_credit" && !attachment) throw new Error("Attach the invoice or receipt before submitting.");
  const sql = getSql();
  const id = randomUUID();
  const prefix = input.kind === "invoice" ? "INV" : input.kind === "reimbursement" ? "REI" : "TRIP";
  const reference = `${prefix}-${id.slice(0, 8).toUpperCase()}`;
  const rows = await sql`
    insert into money_submissions (
      id, reference, employee_name, employee_email, kind, title, description,
      amount, currency, transaction_date, due_date, counterparty, category,
      invoice_number, attachment_name, attachment_content_type, attachment_base64
    ) values (
      ${id}, ${reference}, ${employee.name}, ${employee.email.toLowerCase()}, ${input.kind}, ${input.title}, ${input.description},
      ${input.amount}, ${input.currency}, ${input.transactionDate || null}, ${input.dueDate || null}, ${input.counterparty || ""}, ${input.category || ""},
      ${input.invoiceNumber || ""}, ${attachment?.filename ?? null}, ${attachment?.contentType ?? null}, ${attachment?.base64 ?? null}
    )
    returning id, reference, employee_name, employee_email, kind, title, description, amount, currency, status, transaction_date, due_date, counterparty, category, attachment_name, admin_note, created_at, updated_at
  `;
  return { record: recordFromPostgres(rows[0] as PostgresMoneyRow), persisted: true };
}

async function updatePostgresMoneyReview(target: MoneyReviewTarget, status: MoneyStatus, adminNote: string): Promise<MoneyMutationResult> {
  if (!databaseConfigured()) throw new Error("Money submission storage is unavailable.");
  const id = target.id.slice(3);
  const sql = getSql();
  const currentRows = await sql`select id, reference, employee_name, employee_email, kind, title, description, amount, currency, status, transaction_date, due_date, counterparty, category, attachment_name, admin_note, created_at, updated_at from money_submissions where id = ${id}`;
  if (!currentRows.length) throw new Error("This Money record no longer exists.");
  const current = recordFromPostgres(currentRows[0] as PostgresMoneyRow);
  if (current.updatedAt !== target.updatedAt || current.status !== target.status) throw new Error("This record changed after you opened it. Refresh before reviewing it.");
  if (!isAllowedMoneyStatusTransition(current.kind, current.status, status)) throw new Error(`A ${current.status.replaceAll("_", " ")} record cannot move directly to ${status.replaceAll("_", " ")}.`);
  const rows = await sql`
    update money_submissions set status = ${status}, admin_note = ${adminNote}, updated_at = now()
    where id = ${id} and status = ${target.status} and updated_at = ${target.updatedAt}
    returning id, reference, employee_name, employee_email, kind, title, description, amount, currency, status, transaction_date, due_date, counterparty, category, attachment_name, admin_note, created_at, updated_at
  `;
  if (!rows.length) throw new Error("This record changed after you opened it. Refresh before reviewing it.");
  return { record: recordFromPostgres(rows[0] as PostgresMoneyRow), persisted: true };
}

export async function getMoneyAttachment(id: string) {
  if (!databaseConfigured()) return null;
  const rows = await getSql()`select employee_email, attachment_name, attachment_content_type, attachment_base64 from money_submissions where id = ${id}`;
  if (!rows.length) return null;
  return rows[0] as { employee_email: string; attachment_name: string; attachment_content_type: string; attachment_base64: string };
}
