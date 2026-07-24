import type { DataOrigin, DirectoryPerson } from "./model.ts";

export type PersonalDetailsState =
  | "matched"
  | "not_found"
  | "ambiguous"
  | "unavailable";

export type PersonalDetailSectionKind =
  | "personal"
  | "contact"
  | "address"
  | "emergency"
  | "employment"
  | "financial"
  | "documents"
  | "other";

export type PersonalDetailEntry = {
  readonly label: string;
  readonly value?: string;
};

export type PersonalDetailSection = {
  readonly kind: PersonalDetailSectionKind;
  readonly title: string;
  readonly description: string;
  readonly entries: readonly PersonalDetailEntry[];
};

export type PersonalDetailsProfile = DirectoryPerson & {
  readonly sections: readonly PersonalDetailSection[];
};

export type PersonalDetailsResult = {
  readonly profile?: PersonalDetailsProfile;
  readonly state: PersonalDetailsState;
  readonly origin: DataOrigin;
  readonly integrityIssues: number;
};

const RECORD_ID = /^rec[a-z0-9]{10,}$/i;
const HIDDEN_FIELD = /\b(?:internal|private|manager notes?|hr notes?|performance|disciplinary|airtable|record id|last modified|created by|formula helper|birthday today|automation|slack)\b/i;

const SECTION_META: Record<PersonalDetailSectionKind, { title: string; description: string }> = {
  personal: { title: "Personal information", description: "Identity and personal profile" },
  contact: { title: "Contact details", description: "How People & Operations can reach you" },
  address: { title: "Home address", description: "Your address information on file" },
  emergency: { title: "Emergency contact", description: "Who should be contacted in an emergency" },
  employment: { title: "Employment details", description: "Your role and working arrangement" },
  financial: { title: "Pay, tax & super", description: "Your payment and statutory details" },
  documents: { title: "Documents & eligibility", description: "Recorded employment and identity documents" },
  other: { title: "Other details", description: "Additional information held in Team Members" },
};

export const TEAM_MEMBER_PERSONAL_FIELDS = [
  "Name",
  "Company email",
  "Start Date",
  "Email",
  "Contract",
  "Entity Name",
  "Tax File Number",
  "TFN Declaration Form",
  "International Banking & Payment Details",
  "Date of Birth",
  "Mobile",
  "Address",
  "Emergency Contact Name",
  "Emergency Contact Relationship",
  "Emergency Contact Phone Number",
  "Bank Name",
  "BSB Number",
  "Bank Account Number",
  "Superannuation Fund Name",
  "Super Account Number",
  "Superannuation Member No",
  "Superannuation Fund ABN",
  "Superannuation Fund SPIN/USI",
  "Super Compliance Form",
  "Do you want to make salary sacrifice contributions to your superannuation fund?",
] as const;

export const TEAM_MEMBER_EDITABLE_FIELDS = [
  "Date of Birth",
  "Email",
  "Mobile",
  "Address",
  "Emergency Contact Name",
  "Emergency Contact Relationship",
  "Emergency Contact Phone Number",
  "International Banking & Payment Details",
  "Tax File Number",
  "Bank Name",
  "BSB Number",
  "Bank Account Number",
  "Superannuation Fund Name",
  "Super Account Number",
  "Superannuation Member No",
  "Superannuation Fund ABN",
  "Superannuation Fund SPIN/USI",
  "Do you want to make salary sacrifice contributions to your superannuation fund?",
] as const;

function employeeFacingLabel(label: string) {
  if (/^(?:date of birth|birthday|dob)$/i.test(label.trim())) return "Date of Birth";
  return label.trim();
}

function detailSection(label: string): PersonalDetailSectionKind {
  const field = label.toLowerCase();
  if (/emergency|next of kin|\bnok\b/.test(field)) return "emergency";
  if (/\bbsb\b|bank|banking|tax file|\btfn\b|superannuation|\bsuper\b|salary sacrifice|payment/.test(field)) return "financial";
  if (/address|street|city|town|county|state|postcode|postal|zip|country|residen/.test(field)) return "address";
  if (/personal email|work email|company email|e-mail|email|phone|mobile|telephone|whatsapp|contact number/.test(field)) return "contact";
  if (/position|role|team|brand|availability|status|joined|start date|contract|employment|manager|reports to|timezone|working|hours|office|department|location/.test(field)) return "employment";
  if (/passport|visa|permit|eligib|document|licen[cs]e|identification|national insurance|tax code/.test(field)) return "documents";
  if (/name|pronoun|gender|birth|nationality|citizenship|marital|language|dietary|shirt|t-shirt|photo|profile/.test(field)) return "personal";
  return "other";
}

function scalarValue(value: unknown): string | undefined | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    if (RECORD_ID.test(text)) return null;
    return text.length <= 2_000 ? text : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (!value || typeof value !== "object") return value == null ? undefined : null;

  if ("name" in value && typeof value.name === "string") return scalarValue(value.name);
  if ("filename" in value && typeof value.filename === "string") return scalarValue(value.filename);
  return null;
}

function detailValue(value: unknown): string | undefined | null {
  if (!Array.isArray(value)) return scalarValue(value);
  if (value.length === 0) return undefined;

  const values = value.map(scalarValue);
  if (values.some((item) => item === null)) return null;
  const present = values.filter((item): item is string => Boolean(item));
  return present.length ? present.join(" · ") : undefined;
}

export function buildPersonalDetailsProfile(
  person: DirectoryPerson,
  fields: Readonly<Record<string, unknown>>,
  expectedFields: readonly string[] = [],
): { profile: PersonalDetailsProfile; integrityIssues: number } {
  const grouped = new Map<PersonalDetailSectionKind, PersonalDetailEntry[]>();
  let integrityIssues = 0;

  const fieldNames = [...expectedFields, ...Object.keys(fields)].filter(
    (label, index, labels) => labels.findIndex((candidate) => candidate.toLowerCase() === label.toLowerCase()) === index,
  );

  for (const rawLabel of fieldNames) {
    const sourceLabel = rawLabel.trim();
    if (!sourceLabel || HIDDEN_FIELD.test(sourceLabel)) continue;
    const label = employeeFacingLabel(sourceLabel);

    const rawValue = fields[rawLabel];
    const value = detailValue(rawValue);
    if (value === null) {
      integrityIssues += 1;
      continue;
    }
    const isExpected = expectedFields.some(
      (field) => employeeFacingLabel(field).toLowerCase() === label.toLowerCase(),
    );
    if (!value && !isExpected) continue;

    const section = detailSection(label);
    const entries = grouped.get(section) ?? [];
    const existingIndex = entries.findIndex(
      (entry) => entry.label.toLowerCase() === label.toLowerCase(),
    );
    if (existingIndex === -1) {
      entries.push({ label, value: value || undefined });
      grouped.set(section, entries);
    } else if (!entries[existingIndex].value && value) {
      entries[existingIndex] = { label, value };
    }
  }

  const sections = (Object.keys(SECTION_META) as PersonalDetailSectionKind[]).flatMap((kind) => {
    const entries = grouped.get(kind);
    if (!entries?.length) return [];
    return [{ kind, ...SECTION_META[kind], entries }];
  });

  return { profile: { ...person, sections }, integrityIssues };
}

export function selectPersonalDetails(
  people: readonly DirectoryPerson[],
  verifiedEmail: string,
): Pick<PersonalDetailsResult, "profile" | "state"> {
  const email = verifiedEmail.trim().toLowerCase();
  const matches = people.filter(
    (person) => person.email?.trim().toLowerCase() === email,
  );

  if (matches.length === 1) {
    return { profile: { ...matches[0], sections: [] }, state: "matched" };
  }

  return { state: matches.length > 1 ? "ambiguous" : "not_found" };
}
