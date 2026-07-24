const AIRTABLE_RECORD_ID = /^rec[a-z0-9]{10,}$/i;

function sourceNames(value: unknown): string[] {
  if (typeof value === "string") {
    const name = value.trim();
    return name && !AIRTABLE_RECORD_ID.test(name) ? [name] : [];
  }

  if (Array.isArray(value)) return value.flatMap(sourceNames);

  if (value && typeof value === "object" && "name" in value) {
    return sourceNames(value.name);
  }

  return [];
}

function unique(names: readonly string[]) {
  return names.filter(
    (name, index) => names.findIndex((candidate) => candidate.toLowerCase() === name.toLowerCase()) === index,
  );
}

function exactFieldValues(
  fields: Readonly<Record<string, unknown>>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const key = Object.keys(fields).find((candidate) => candidate.toLowerCase() === alias.toLowerCase());
    const names = key ? unique(sourceNames(fields[key])) : [];
    if (names.length) return names;
  }
  return [];
}

function matchingFieldValues(
  fields: Readonly<Record<string, unknown>>,
  matches: (field: string) => boolean,
) {
  return unique(
    Object.entries(fields)
      .filter(([field]) => matches(field))
      .flatMap(([, value]) => sourceNames(value)),
  );
}

export function directoryRole(fields: Readonly<Record<string, unknown>>) {
  const exact = exactFieldValues(fields, [
    "Position description",
    "Position Name",
    "Position",
    "Job Title",
    "Role",
    "Role Name",
  ]);
  if (exact.length) return exact.join(" · ");

  return matchingFieldValues(
    fields,
    (field) => /\b(?:position|role|job title)\b/i.test(field)
      && !/\b(?:description link|document|file|status|count|number|id)\b/i.test(field),
  ).join(" · ");
}

export function directoryTeam(fields: Readonly<Record<string, unknown>>) {
  const exact = exactFieldValues(fields, ["Team", "Team Name", "Department"]);
  if (exact.length) return exact.join(" · ");

  return matchingFieldValues(
    fields,
    (field) => /\bteam\b/i.test(field) && !/\b(?:brand|overview|count|number|id)\b/i.test(field),
  ).join(" · ");
}

export function directoryBrands(fields: Readonly<Record<string, unknown>>) {
  const exact = exactFieldValues(fields, [
    "Brands",
    "Brand",
    "Brand Names",
    "Brand Name",
    "Brands worked for",
    "Brands (from Team Overview per Brands)",
    "Brand (from Team Overview per Brands)",
  ]);
  if (exact.length) return exact;

  return matchingFieldValues(
    fields,
    (field) => /\bbrands?\b/i.test(field)
      && !/\b(?:colour|color|document|folder|guideline|legal|overview|status|count|number|id)\b/i.test(field),
  );
}
