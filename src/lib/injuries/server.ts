import "server-only";

import { randomUUID } from "node:crypto";
import { identityMode } from "@/lib/identity/server";
import type { VerifiedIdentity } from "@/lib/identity/types";
import { isValidInjurySourceRecord, type InjuryCollection, type InjuryMutationResult, type InjuryRecord, type NewInjuryReport } from "./model";
import { previewInjuryRecords } from "./preview-data";

type AirtableRecord = { id: string; fields: Record<string, unknown>; createdTime?: string };
type AirtableResponse = { records?: AirtableRecord[]; offset?: string };

const BODY_FIELD = "Bodily location of injury/illness (for illnesses include syptoms):";
const EQUIPMENT_FIELD = "Was any plant, equipment, substance or thing involved in the injury/illness? If yes, please provide details";

function config() {
  return {
    token: process.env.AIRTABLE_HR_TOKEN || process.env.AIRTABLE_INJURIES_TOKEN || process.env.AIRTABLE_DIRECTORY_TOKEN,
    baseId: process.env.AIRTABLE_HR_BASE_ID || process.env.AIRTABLE_INJURIES_BASE_ID || "appYP9nVmzqan2PlU",
    peopleTable: process.env.AIRTABLE_DIRECTORY_TABLE || "tblJ6mB7XXWnMbezL",
    injuriesTable: process.env.AIRTABLE_INJURIES_TABLE || "tblOXrKn3Pl6jV2Fz",
    employeeField: process.env.AIRTABLE_INJURIES_EMPLOYEE_FIELD || "Team Members",
    writesEnabled: process.env.AIRTABLE_INJURIES_WRITES_ENABLED === "true",
  };
}

function escapeFormula(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map((item) => text(item)).find(Boolean) || "";
}

function calendarDate(value: unknown) {
  const source = text(value);
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(source);
  return match?.[1] || source;
}

function employeeName(fields: Record<string, unknown>) {
  return text(fields.Signature) || firstText(fields["Name (from Team Members)"]) || text(fields.Name);
}

function recordBelongsToEmployee(record: AirtableRecord, employeeField: string, employeeId: string, name: string) {
  const linkedEmployee = record.fields[employeeField];
  if (Array.isArray(linkedEmployee) && linkedEmployee.includes(employeeId)) return true;
  return employeeName(record.fields).localeCompare(name, undefined, { sensitivity: "accent" }) === 0;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRegisterAirtableRecord(record: AirtableRecord) {
  const fields = record.fields;
  if (text(fields.Injury) || text(fields["Mental Health / Personal Crisis"])) return true;
  return Boolean(
    text(fields["Date of Injury"])
    || text(fields["Nature of Injury/Illness"])
    || text(fields[BODY_FIELD])
    || text(fields[EQUIPMENT_FIELD]),
  );
}

function recordFromAirtable(record: AirtableRecord): InjuryRecord | null {
  if (!record.id || !record.fields || typeof record.fields !== "object") return null;
  const fields = record.fields;
  const dateOfSubmission = text(fields["Date of submission"]) || record.createdTime || "";
  const source = {
    dateOfSubmission,
    dateOfInjury: calendarDate(fields["Date of Injury"]) || calendarDate(dateOfSubmission),
    nature: text(fields["Nature of Injury/Illness"])
      || text(fields["Reason:"])
      || text(fields.Injury)
      || text(fields["Mental Health / Personal Crisis"]),
  };
  if (!isValidInjurySourceRecord(source)) return null;
  return {
    id: record.id,
    employeeName: employeeName(fields) || undefined,
    ...source,
    location: text(fields["Location at time of injury"]) || undefined,
    discussedWithManager: typeof fields["Have you discussed the matter with your manager?"] === "boolean"
      ? fields["Have you discussed the matter with your manager?"]
      : undefined,
    daysOff: number(fields["Number of days off"]),
    additionalInformation: text(fields["Additional Information"]) || undefined,
    bodilyLocation: text(fields[BODY_FIELD]) || undefined,
    equipmentDetails: text(fields[EQUIPMENT_FIELD]) || undefined,
  };
}

async function airtableRequest(table: string, query?: URLSearchParams) {
  const settings = config();
  if (!settings.token || !settings.baseId) return null;
  const suffix = query ? `?${query}` : "";
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(table)}${suffix}`, {
    headers: { Authorization: `Bearer ${settings.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Airtable injury request failed with status ${response.status}.`);
  return response;
}

async function findEmployee(identity: VerifiedIdentity) {
  const settings = config();
  const formula = `OR(LOWER({Company email})='${escapeFormula(identity.email.toLowerCase())}',LOWER({Email})='${escapeFormula(identity.email.toLowerCase())}')`;
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: formula });
  const response = await airtableRequest(settings.peopleTable, query);
  if (!response) return null;
  const page = (await response.json()) as AirtableResponse;
  const employee = page.records?.[0];
  if (!employee) return null;
  return {
    id: employee.id,
    name: text(employee.fields.Name),
    position: Array.isArray(employee.fields.Position) ? employee.fields.Position.filter((item): item is string => typeof item === "string") : [],
  };
}

export async function getEmployeeInjuries(identity: VerifiedIdentity): Promise<InjuryCollection> {
  if (identityMode() === "preview") return { items: previewInjuryRecords, origin: "preview", employeeMatched: true, integrityIssues: 0 };
  const settings = config();
  if (!settings.token) return { items: [], origin: "unavailable", employeeMatched: false, integrityIssues: 0 };
  const employee = await findEmployee(identity);
  if (!employee?.name) return { items: [], origin: "airtable", employeeMatched: false, integrityIssues: 0 };

  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (offset) query.set("offset", offset);
    const response = await airtableRequest(settings.injuriesTable, query);
    if (!response) break;
    const page = (await response.json()) as AirtableResponse;
    records.push(...(page.records ?? []).filter((record) => {
      return isRegisterAirtableRecord(record)
        && recordBelongsToEmployee(record, settings.employeeField, employee.id, employee.name);
    }));
    offset = page.offset;
  } while (offset);

  const registerRecords = records.filter(isRegisterAirtableRecord);
  const items = registerRecords.flatMap((record) => {
    const item = recordFromAirtable(record);
    return item ? [item] : [];
  });
  return {
    items: items.sort((a, b) => b.dateOfSubmission.localeCompare(a.dateOfSubmission)),
    origin: "airtable",
    employeeMatched: true,
    integrityIssues: registerRecords.length - items.length,
  };
}

export async function getAllInjuries(): Promise<InjuryCollection> {
  if (identityMode() === "preview") {
    return {
      items: previewInjuryRecords.map((record) => ({ ...record, employeeName: record.employeeName || "Preview employee" })),
      origin: "preview",
      employeeMatched: true,
      integrityIssues: 0,
    };
  }

  const settings = config();
  if (!settings.token) return { items: [], origin: "unavailable", employeeMatched: false, integrityIssues: 0 };

  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (offset) query.set("offset", offset);
    const response = await airtableRequest(settings.injuriesTable, query);
    if (!response) break;
    const page = (await response.json()) as AirtableResponse;
    records.push(...(page.records ?? []));
    offset = page.offset;
  } while (offset);

  const registerRecords = records.filter(isRegisterAirtableRecord);
  const items = registerRecords.flatMap((record) => {
    const item = recordFromAirtable(record);
    return item ? [item] : [];
  });
  return {
    items: items.sort((a, b) => b.dateOfSubmission.localeCompare(a.dateOfSubmission)),
    origin: "airtable",
    employeeMatched: true,
    integrityIssues: registerRecords.length - items.length,
  };
}

function previewRecord(input: NewInjuryReport): InjuryRecord {
  return {
    id: `preview-${randomUUID()}`,
    dateOfSubmission: new Date().toISOString(),
    dateOfInjury: input.dateOfInjury,
    nature: input.nature,
    location: input.location || undefined,
    discussedWithManager: input.discussedWithManager,
    daysOff: input.daysOff,
    additionalInformation: input.additionalInformation || undefined,
    bodilyLocation: input.bodilyLocation || undefined,
    equipmentDetails: input.equipmentDetails || undefined,
  };
}

function reportFields(input: NewInjuryReport): Record<string, unknown> {
  return {
    "Date of Injury": input.dateOfInjury,
    "Nature of Injury/Illness": input.nature,
    "Location at time of injury": input.location,
    "Have you discussed the matter with your manager?": input.discussedWithManager,
    "Number of days off": input.daysOff,
    "Additional Information": input.additionalInformation,
    [BODY_FIELD]: input.bodilyLocation,
    [EQUIPMENT_FIELD]: input.equipmentDetails,
  };
}

export async function createInjuryReport(identity: VerifiedIdentity, input: NewInjuryReport): Promise<InjuryMutationResult> {
  const settings = config();
  if (identityMode() === "preview") return { record: previewRecord(input), persisted: false };
  if (!settings.token || !settings.writesEnabled) throw new Error("Injury submissions are not configured for this environment.");
  const employee = await findEmployee(identity);
  if (!employee?.name) throw new Error("Your verified work email could not be matched to a Team Members record.");

  const fields: Record<string, unknown> = {
    ...reportFields(input),
    Injury: "Physical Injury",
    Name: employee.name,
    [settings.employeeField]: [employee.id],
    Signature: employee.name,
  };
  if (employee.position.length) fields.Position = employee.position;

  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(settings.injuriesTable)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Airtable injury submission failed with status ${response.status}.`);
  const record = recordFromAirtable((await response.json()) as AirtableRecord);
  if (!record) throw new Error("Airtable accepted the report but returned a record Cove could not verify. Refresh before retrying.");
  return { record, persisted: true };
}

export async function updateEmployeeInjury(
  identity: VerifiedIdentity,
  recordId: string,
  input: NewInjuryReport,
): Promise<InjuryMutationResult> {
  if (identityMode() === "preview") {
    const existing = previewInjuryRecords.find((record) => record.id === recordId);
    return {
      record: {
        ...previewRecord(input),
        id: recordId,
        employeeName: existing?.employeeName,
        dateOfSubmission: existing?.dateOfSubmission ?? new Date().toISOString(),
      },
      persisted: false,
    };
  }

  const settings = config();
  if (!settings.token || !settings.writesEnabled) throw new Error("Injury updates are not configured for this environment.");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new Error("This injury report could not be identified.");
  const employee = await findEmployee(identity);
  if (!employee?.name) throw new Error("Your verified work email could not be matched to a Team Members record.");

  const existingResponse = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(settings.injuriesTable)}/${encodeURIComponent(recordId)}`,
    {
      headers: { Authorization: `Bearer ${settings.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!existingResponse.ok) throw new Error(`This injury report could not be loaded (status ${existingResponse.status}).`);
  const existing = (await existingResponse.json()) as AirtableRecord;
  if (!recordBelongsToEmployee(existing, settings.employeeField, employee.id, employee.name)) {
    throw new Error("You can only edit injury reports submitted under your own work identity.");
  }

  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(settings.baseId)}/${encodeURIComponent(settings.injuriesTable)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: reportFields(input) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error(`Airtable injury update failed with status ${response.status}.`);
  const record = recordFromAirtable((await response.json()) as AirtableRecord);
  if (!record) throw new Error("Airtable accepted the update but returned a report Cove could not verify. Refresh before retrying.");
  return { record, persisted: true };
}
