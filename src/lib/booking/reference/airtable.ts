import "server-only";

// Minimal READ-ONLY Airtable REST client for the booking reference sync.
// Deliberately exposes no write methods — Airtable is a source of truth we
// must never mutate.

import type { AirtableRecordLike } from "./normalize.ts";

const AIRTABLE_API = "https://api.airtable.com/v0";
/** Airtable allows 5 requests/second per base; stay well under it. */
const PAGE_DELAY_MS = 250;
const MAX_RETRIES = 5;

export const AIRTABLE_BOOKING_BASE_ID = process.env.AIRTABLE_BOOKING_BASE_ID ?? "appnRSV0g89whVidp";
export const AIRTABLE_HR_BASE_ID = process.env.AIRTABLE_HR_BASE_ID ?? "appYP9nVmzqan2PlU";

type AirtableListPayload = {
  records: Array<{ id: string; createdTime?: string; fields?: Record<string, unknown> }>;
  offset?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string, token: string): Promise<AirtableListPayload> {
  let attempt = 0;
  for (;;) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.status === 429 || response.status >= 500) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        throw new Error(`Airtable request failed with ${response.status} after ${MAX_RETRIES} retries.`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt;
      await sleep(delay);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Airtable request failed with ${response.status} ${response.statusText}.`);
    }
    return (await response.json()) as AirtableListPayload;
  }
}

/**
 * List every record of a table (GET only), requesting just the given fields.
 * Paginates at pageSize=100 with a polite delay between pages and backs off
 * on 429s.
 */
export async function listAll(baseId: string, table: string, fields: string[]): Promise<AirtableRecordLike[]> {
  const token = process.env.AIRTABLE_BOOKING_TOKEN?.trim();
  if (!token) throw new Error("AIRTABLE_BOOKING_TOKEN is not configured.");

  const records: AirtableRecordLike[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const field of fields) params.append("fields[]", field);
    if (offset) params.set("offset", offset);
    const url = `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`;
    const payload = await fetchPage(url, token);
    for (const record of payload.records ?? []) {
      records.push({ id: record.id, fields: record.fields ?? {} });
    }
    offset = payload.offset;
    if (offset) await sleep(PAGE_DELAY_MS);
  } while (offset);
  return records;
}
