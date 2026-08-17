import "server-only";

// Shared reads for the Guest Communications pages.

import { getSql } from "@/lib/booking/db";
import { isMoment, type TemplateRowMeta } from "@/lib/booking/notify/template-scope.ts";
import type { Brand } from "@/lib/booking/model";

/** Every active template row, with brand ids mapped to brand keys. */
export async function getActiveTemplateRows(brands: Brand[]): Promise<TemplateRowMeta[]> {
  const sql = getSql();
  const rows = await sql`
    select moment, brand_id, event_type_key, updated_by, updated_at
    from booking.message_template
    where active`;
  const keyById = new Map(brands.map((brand) => [brand.id, brand.key]));
  const metas: TemplateRowMeta[] = [];
  for (const row of rows) {
    const moment = String(row.moment);
    if (!isMoment(moment)) continue;
    metas.push({
      moment,
      brandKey: row.brand_id ? (keyById.get(String(row.brand_id)) ?? null) : null,
      eventTypeKey: (row.event_type_key as string | null) ?? null,
      updatedBy: (row.updated_by as string | null) ?? null,
      updatedAt: new Date(row.updated_at as string).toISOString(),
    });
  }
  return metas;
}

/** Distinct guest-facing call-type keys across all brands. */
export async function getGuestFacingTypeKeys(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    select distinct key from booking.event_type
    where guest_facing and active
    order by key`;
  return rows.map((row) => String(row.key));
}
