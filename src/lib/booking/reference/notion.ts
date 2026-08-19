import "server-only";

// READ-ONLY Notion client for the Team Directory roster. The only call made
// is the database query endpoint (a read, despite being an HTTP POST).

import type { NotionStaffRow } from "./normalize.ts";

export type { NotionStaffRow };

const NOTION_VERSION = "2022-06-28";
/** Team Directory database id (the query endpoint wants the database id). */
const TEAM_DIRECTORY_DATABASE_ID = "3563b112-a0e0-80fe-8ccc-fd3667a0807f";

type NotionRichTextItem = { plain_text?: string };

type NotionPage = {
  id: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

type NotionQueryPayload = {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function textOf(property: unknown, key: "title" | "rich_text"): string | null {
  const items = (property as Record<string, unknown> | undefined)?.[key];
  if (!Array.isArray(items)) return null;
  const text = items
    .map((item: NotionRichTextItem) => item?.plain_text ?? "")
    .join("")
    .trim();
  return text || null;
}

function emailOf(property: unknown): string | null {
  const email = (property as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function multiSelectNames(property: unknown): string[] {
  const options = (property as { multi_select?: unknown } | undefined)?.multi_select;
  if (!Array.isArray(options)) return [];
  return options
    .map((option: { name?: unknown }) => (typeof option?.name === "string" ? option.name : null))
    .filter((name): name is string => Boolean(name));
}

function selectName(property: unknown): string | null {
  const name = (property as { select?: { name?: unknown } } | undefined)?.select?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function phoneOf(property: unknown): string | null {
  const phone = (property as { phone_number?: unknown } | undefined)?.phone_number;
  return typeof phone === "string" && phone.trim() ? phone.trim() : null;
}

function firstFileUrl(property: unknown): string | null {
  const files = (property as { files?: unknown } | undefined)?.files;
  if (!Array.isArray(files) || files.length === 0) return null;
  const file = files[0] as { type?: string; file?: { url?: unknown }; external?: { url?: unknown } };
  const url = file?.type === "external" ? file.external?.url : file?.file?.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/**
 * Fetch every Team Directory row whose Department contains "Booking Manager"
 * and normalise into plain rows. photoUrl is a signed S3 URL that expires in
 * about an hour — download it promptly, never persist it.
 */
export async function fetchBookingManagerRoster(): Promise<NotionStaffRow[]> {
  return fetchDirectoryRows({ property: "Department", multi_select: { contains: "Booking Manager" } });
}

/**
 * Leadership rows whose Job Title contains "Pod Lead" (incl. "Acting Pod
 * Lead"). Their Brand lists define the dashboard's pods.
 */
export async function fetchPodLeads(): Promise<NotionStaffRow[]> {
  const rows = await fetchDirectoryRows({ property: "Department", multi_select: { contains: "Leadership" } });
  return rows.filter((row) => /pod lead/i.test(row.jobTitle ?? ""));
}

async function fetchDirectoryRows(filter: Record<string, unknown>): Promise<NotionStaffRow[]> {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) throw new Error("NOTION_TOKEN is not configured.");

  const rows: NotionStaffRow[] = [];
  let cursor: string | null = null;
  do {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${TEAM_DIRECTORY_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          page_size: 100,
          filter,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Notion query failed with ${response.status} ${response.statusText}.`);
    }
    const payload = (await response.json()) as NotionQueryPayload;
    for (const page of payload.results ?? []) {
      const properties = page.properties ?? {};
      const name = textOf(properties["Name"], "title");
      if (!name) continue;
      rows.push({
        notionPageId: page.id,
        name,
        email: emailOf(properties["Email"]),
        jobTitle: textOf(properties["Job Title"], "rich_text"),
        brands: multiSelectNames(properties["Brand"]),
        location: selectName(properties["Location"]),
        phone: phoneOf(properties["Phone Number"]),
        slackId: textOf(properties["Slack ID"], "rich_text"),
        photoUrl: firstFileUrl(properties["Profile Picture"]),
        lastEdited: page.last_edited_time ?? null,
      });
    }
    cursor = payload.has_more ? (payload.next_cursor ?? null) : null;
  } while (cursor);

  return rows;
}
