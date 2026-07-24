import "server-only";

import { identityMode } from "@/lib/identity/server";
import type { VerifiedIdentity } from "@/lib/identity/types";
import type { AirtableCollection, Brand, DirectoryPerson } from "./model";
import { airtableBrandSnapshot } from "./brand-snapshot";
import { airtableDirectorySnapshot } from "./snapshot";
import { directoryBrands, directoryRole, directoryTeam } from "./directory-fields";
import {
  buildPersonalDetailsProfile,
  selectPersonalDetails,
  TEAM_MEMBER_PERSONAL_FIELDS,
  type PersonalDetailsResult,
} from "./personal-details";
import {
  parseBirthday,
  parseInstagramUrl,
  parseSafeEmail,
  parseSafeHttpsUrl,
  parseSourceDate,
} from "./integrity";

type AirtableRecord = { id: string; fields: Record<string, unknown> };
type AirtableResponse = { records?: AirtableRecord[]; offset?: string };
type AirtableConfig = { token?: string; baseId?: string; table?: string };
type AirtableReadOptions = {
  readonly fields?: readonly string[];
  readonly filterByFormula?: string;
  readonly maxRecords?: number;
};

function hrTableConfig(): AirtableConfig {
  return {
    token: process.env.AIRTABLE_HR_TOKEN || process.env.AIRTABLE_DIRECTORY_TOKEN,
    baseId: process.env.AIRTABLE_HR_BASE_ID || process.env.AIRTABLE_DIRECTORY_BASE_ID || "appYP9nVmzqan2PlU",
    table: process.env.AIRTABLE_HR_TABLE || process.env.AIRTABLE_DIRECTORY_TABLE || "Team Members",
  };
}

function textField(fields: Record<string, unknown>, name: string, fallback = "") {
  const value = fields[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstTextField(fields: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = textField(fields, name);
    if (value) return value;
  }
  return undefined;
}

function selectName(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") return value.name;
  return fallback;
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function attachmentSource(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return undefined;
  const first = value[0];
  if (!first || typeof first !== "object" || !("url" in first)) return null;
  return typeof first.url === "string" ? first.url : null;
}

function accentFromColours(value: string | undefined, fallback: string) {
  const match = value?.match(/#?([0-9a-f]{6})/i);
  return match ? `#${match[1]}` : fallback;
}

async function readTable(config: AirtableConfig, options: AirtableReadOptions = {}): Promise<AirtableRecord[] | null> {
  if (!config.token || !config.baseId || !config.table) return null;
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (options.filterByFormula) query.set("filterByFormula", options.filterByFormula);
    if (options.maxRecords) query.set("maxRecords", String(options.maxRecords));
    for (const field of options.fields ?? []) query.append("fields[]", field);
    if (offset) query.set("offset", offset);
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}?${query}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Airtable request failed with status ${response.status}.`);
    const page = (await response.json()) as AirtableResponse;
    records.push(...(page.records ?? []));
    if (options.maxRecords && records.length >= options.maxRecords) break;
    offset = page.offset;
  } while (offset);

  return records;
}

export async function getBrands(): Promise<AirtableCollection<Brand>> {
  if (identityMode() === "preview") {
    return { items: airtableBrandSnapshot, origin: "preview", integrityIssues: 0 };
  }

  const records = await readTable({
    token: process.env.AIRTABLE_BRANDS_TOKEN,
    baseId: process.env.AIRTABLE_BRANDS_BASE_ID,
    table: process.env.AIRTABLE_BRANDS_TABLE,
  });

  if (!records) return { items: [], origin: "unavailable", integrityIssues: 0 };

  let integrityIssues = 0;
  const imageHosts = new Set(["v5.airtableusercontent.com"]);

  const items = records.flatMap(({ id, fields }) => {
    const name = textField(fields, "Name");
    if (!id || !name) {
      integrityIssues += 1;
      return [];
    }

    const snapshot = airtableBrandSnapshot.find((brand) => brand.name.toLowerCase() === name.toLowerCase());
    const registrationStatus = textField(fields, "Registration Status", "Status not set");
    const brandColours = textField(fields, "Brand Colours") || snapshot?.brandColours;
    const logoSource = attachmentSource(fields.Logo);
    const candidates = {
      website: textField(fields, "Website") || snapshot?.website,
      instagram: textField(fields, "Instagram") || snapshot?.instagram,
      facebook: textField(fields, "Facebook") || snapshot?.facebook,
      brandFilesUrl: textField(fields, "Brand Documents Folder") || snapshot?.brandFilesUrl,
      brandGuidelinesUrl: textField(fields, "Logos and Brand Image Guidelines") || snapshot?.brandGuidelinesUrl,
      productBriefUrl: textField(fields, "Brand Product Brief") || snapshot?.productBriefUrl,
      logoUrl: logoSource === undefined ? snapshot?.logoUrl : logoSource,
    };
    const parsed = {
      website: parseSafeHttpsUrl(candidates.website),
      instagram: parseInstagramUrl(candidates.instagram),
      facebook: parseSafeHttpsUrl(candidates.facebook),
      brandFilesUrl: parseSafeHttpsUrl(candidates.brandFilesUrl),
      brandGuidelinesUrl: parseSafeHttpsUrl(candidates.brandGuidelinesUrl),
      productBriefUrl: parseSafeHttpsUrl(candidates.productBriefUrl),
      logoUrl: parseSafeHttpsUrl(candidates.logoUrl, imageHosts),
    };
    if (Object.values(parsed).some((value) => value === null)) integrityIssues += 1;

    return [{
      id,
      name,
      description: snapshot?.description ?? "",
      category: snapshot?.category ?? "Brand overview",
      region: snapshot?.region ?? "Leatherback network",
      website: parsed.website ?? undefined,
      instagram: parsed.instagram ?? undefined,
      facebook: parsed.facebook ?? undefined,
      brandFilesUrl: parsed.brandFilesUrl ?? undefined,
      brandFilesLabel: "Brand files",
      brandGuidelinesUrl: parsed.brandGuidelinesUrl ?? undefined,
      productBriefUrl: parsed.productBriefUrl ?? undefined,
      brandColours,
      registrationStatus,
      legalEntityOwner: textField(fields, "Legal Entity Owner") || snapshot?.legalEntityOwner,
      logoUrl: parsed.logoUrl ?? undefined,
      logoTone: "dark" as const,
      status: registrationStatus.toLowerCase() === "registered" ? "active" as const : "developing" as const,
      accent: accentFromColours(brandColours, snapshot?.accent ?? "#0b8b84"),
    }];
  });

  return {
    origin: "airtable",
    items: items.sort((a, b) => a.name.localeCompare(b.name)),
    integrityIssues,
  };
}

export async function getDirectory(): Promise<AirtableCollection<DirectoryPerson>> {
  if (identityMode() === "preview") {
    return { items: airtableDirectorySnapshot, origin: "preview", integrityIssues: 0 };
  }

  const records = await readTable(hrTableConfig());

  if (!records) return { items: [], origin: "unavailable", integrityIssues: 0 };

  let integrityIssues = 0;
  const people = records.flatMap(({ id, fields }) => {
    const name = textField(fields, "Name");
    if (!id || !name) {
      integrityIssues += 1;
      return [];
    }
    const status = selectName(fields.Status);
    const joinedDate = parseSourceDate(firstTextField(fields, ["Date joined", "Date Joined", "Start date", "Start Date", "Employment Start Date", "Joining Date"]));
    const birthday = parseBirthday(firstTextField(fields, ["Birthday", "Date of birth", "Date of Birth", "DOB"]));
    const email = parseSafeEmail(firstTextField(fields, ["Company email", "Email"]));
    if ([joinedDate, birthday, email].some((value) => value === null)) integrityIssues += 1;

    return [{
      id,
      name,
      role: directoryRole(fields),
      team: directoryTeam(fields),
      brands: directoryBrands(fields),
      availability: selectName(fields.Availability, status),
      joinedDate: joinedDate ?? undefined,
      birthday: birthday ?? undefined,
      email: email ?? undefined,
      initials: initialsFor(name),
      status,
    }];
  });

  return {
    origin: "airtable",
    items: people.filter((person) => person.status !== "Past"),
    integrityIssues,
  };
}

export async function getPersonalDetails(
  identity: Pick<VerifiedIdentity, "displayName" | "email" | "initials">,
): Promise<PersonalDetailsResult> {
  if (identityMode() === "preview") {
    return {
      state: "matched",
      origin: "preview",
      integrityIssues: 0,
      profile: {
        id: "preview-personal-details",
        name: identity.displayName,
        email: identity.email,
        initials: identity.initials,
        role: "People & Operations lead",
        team: "Leatherback Travel",
        availability: "Full-time",
        joinedDate: "2023-02-06",
        birthday: "2000-10-12",
        sections: [
          {
            kind: "personal",
            title: "Personal information",
            description: "Identity and personal profile",
            entries: [
              { label: "Full legal name", value: identity.displayName },
              { label: "Birthday", value: "1990-10-12" },
              { label: "Nationality", value: "British" },
              { label: "Preferred language", value: "English" },
            ],
          },
          {
            kind: "contact",
            title: "Contact details",
            description: "How People & Operations can reach you",
            entries: [
              { label: "Company email", value: identity.email },
              { label: "Personal email", value: "preview.employee@example.test" },
              { label: "Mobile phone", value: "+44 7700 900000" },
            ],
          },
          {
            kind: "address",
            title: "Home address",
            description: "Your address information on file",
            entries: [
              { label: "Address", value: "18 Harbour Lane" },
              { label: "City", value: "Brighton" },
              { label: "Postcode", value: "BN1 1AA" },
              { label: "Country", value: "United Kingdom" },
            ],
          },
          {
            kind: "emergency",
            title: "Emergency contact",
            description: "Who should be contacted in an emergency",
            entries: [
              { label: "Emergency contact name", value: "Morgan Example" },
              { label: "Emergency contact relationship", value: "Partner" },
              { label: "Emergency contact phone", value: "+44 7700 900001" },
            ],
          },
          {
            kind: "employment",
            title: "Employment details",
            description: "Your role and working arrangement",
            entries: [
              { label: "Position description", value: "People & Operations lead" },
              { label: "Team", value: "Leatherback Travel" },
              { label: "Availability", value: "Full-time" },
              { label: "Date joined", value: "2023-02-06" },
            ],
          },
        ],
      },
    };
  }

  const emailFormula = `LOWER({Company email})=${JSON.stringify(identity.email.trim().toLowerCase())}`;
  const readOptions = { filterByFormula: emailFormula, maxRecords: 2 } as const;
  const records = await readTable(hrTableConfig(), readOptions);
  if (!records) {
    return {
      state: "unavailable",
      origin: "unavailable",
      integrityIssues: 0,
    };
  }

  let personalFieldRecords: AirtableRecord[] = [];
  try {
    personalFieldRecords = await readTable(hrTableConfig(), {
      ...readOptions,
      fields: TEAM_MEMBER_PERSONAL_FIELDS,
    }) ?? [];
  } catch {
    // The core record still renders if a renamed Airtable field makes the
    // explicit personal-details projection temporarily unavailable.
  }

  const personalFieldsByRecord = new Map(
    personalFieldRecords.map((record) => [record.id, record.fields]),
  );
  const mergedRecords = records.map((record) => ({
    ...record,
    fields: { ...record.fields, ...personalFieldsByRecord.get(record.id) },
  }));

  let integrityIssues = 0;
  const parsed = mergedRecords.flatMap(({ id, fields }) => {
    const name = textField(fields, "Name");
    const email = parseSafeEmail(firstTextField(fields, ["Company email", "Company Email", "Work email", "Work Email", "Email"]));
    if (!id || !name || email === null) {
      integrityIssues += 1;
      return [];
    }

    const status = selectName(fields.Status);
    if (status === "Past") return [];
    const person: DirectoryPerson = {
      id,
      name,
      role: directoryRole(fields),
      team: directoryTeam(fields),
      brands: directoryBrands(fields),
      availability: selectName(fields.Availability, status),
      joinedDate: parseSourceDate(firstTextField(fields, ["Date joined", "Date Joined", "Start date", "Start Date", "Employment Start Date", "Joining Date"])) ?? undefined,
      birthday: parseBirthday(firstTextField(fields, ["Birthday", "Date of birth", "Date of Birth", "DOB"])) ?? undefined,
      email: email ?? undefined,
      initials: initialsFor(name),
    };
    return [{ person, fields }];
  });

  const selected = selectPersonalDetails(parsed.map(({ person }) => person), identity.email);
  const matchedRecord = selected.profile
    ? parsed.find(({ person }) => person.id === selected.profile?.id)
    : undefined;
  const complete = matchedRecord
    ? buildPersonalDetailsProfile(matchedRecord.person, matchedRecord.fields, TEAM_MEMBER_PERSONAL_FIELDS)
    : undefined;

  return {
    ...selected,
    profile: complete?.profile,
    origin: "airtable",
    integrityIssues:
      integrityIssues + (complete?.integrityIssues ?? 0) + (selected.state === "ambiguous" ? 1 : 0),
  };
}

export async function updatePersonalDetails(
  identity: Pick<VerifiedIdentity, "email">,
  fields: Readonly<Record<string, string>>,
): Promise<void> {
  if (identityMode() !== "clerk") {
    throw new Error("Personal detail changes are only available in Cove.");
  }

  const config = hrTableConfig();
  if (!config.token || !config.baseId || !config.table) {
    throw new Error("The Team Members connection is unavailable.");
  }

  const emailFormula = `LOWER({Company email})=${JSON.stringify(identity.email.trim().toLowerCase())}`;
  const records = await readTable(config, {
    filterByFormula: emailFormula,
    maxRecords: 2,
    fields: ["Company email", "Status"],
  });
  const currentRecords = (records ?? []).filter(
    (record) => selectName(record.fields.Status) !== "Past",
  );
  if (currentRecords.length !== 1) {
    throw new Error("Cove could not safely match one current Team Members record.");
  }

  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}/${encodeURIComponent(currentRecords[0].id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        typecast: true,
        fields: Object.fromEntries(
          Object.entries(fields).map(([field, value]) => [field, value || null]),
        ),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error(`Airtable request failed with status ${response.status}.`);
}
