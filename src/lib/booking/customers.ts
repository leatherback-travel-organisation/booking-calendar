import "server-only";

// Read-only guest lookup against the Airtable Customers table, for internal
// bookings ("book this guest in with a BM"). Same base and token discipline
// as leads.ts: Airtable is never written, and a missing token degrades to an
// explicit error rather than an empty everything-is-fine result.

const AIRTABLE_API = "https://api.airtable.com/v0";
const BOOKING_BASE_ID = "appnRSV0g89whVidp";
const CUSTOMERS_TABLE = "Customers";

export type CustomerHit = {
  recordId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/**
 * Case-insensitive substring search over name and email fields. Formula
 * inputs are stripped of quote/backslash characters (leads.ts convention) so
 * the formula cannot be broken out of.
 */
export async function searchCustomers(query: string): Promise<CustomerHit[]> {
  const token = process.env.AIRTABLE_BOOKING_TOKEN?.trim();
  if (!token) throw new Error("Airtable is not configured in this environment.");
  const needle = query.trim().toLowerCase().replace(/["'\\]/g, "");
  if (needle.length < 2) return [];

  const haystacks = ["{Client}", "{Preferred Name}", "{Client Email}", "{Alt Email}"];
  const formula = `OR(${haystacks.map((field) => `FIND('${needle}', LOWER(${field}&''))`).join(",")})`;

  const params = new URLSearchParams({ filterByFormula: formula, pageSize: "8" });
  for (const field of ["Client", "Preferred Name", "First Name", "Surname", "Client Email", "Alt Email", "Phone Number"]) {
    params.append("fields[]", field);
  }

  const response = await fetch(
    `${AIRTABLE_API}/${BOOKING_BASE_ID}/${encodeURIComponent(CUSTOMERS_TABLE)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Airtable customer search failed (${response.status})`);
  const payload = (await response.json()) as {
    records?: Array<{ id: string; fields?: Record<string, unknown> }>;
  };

  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

  return (payload.records ?? []).map((record) => {
    const fields = record.fields ?? {};
    const name =
      text(fields["Client"]) ??
      [text(fields["Preferred Name"]) ?? text(fields["First Name"]), text(fields["Surname"])]
        .filter(Boolean)
        .join(" ") ??
      "(unnamed)";
    return {
      recordId: record.id,
      name: name || "(unnamed)",
      email: text(fields["Client Email"]) ?? text(fields["Alt Email"]),
      phone: text(fields["Phone Number"]),
    };
  });
}
