// POST /api/booking/public/hold — 120-second cosmetic hold while the guest
// fills the confirmation form. UX nicety only; the exclusion constraint is
// the real guarantee.

import { z } from "zod";
import { getBrandByKey, getEventType, getStaffBySlug } from "@/lib/booking/availability/service";
import { createHold } from "@/lib/booking/service";
import { jsonResponse } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HoldSchema = z.object({
  staffSlug: z.string().min(1).max(100),
  brandKey: z.string().min(1).max(50),
  eventTypeKey: z.string().min(1).max(50),
  startIso: z.string().datetime({ offset: true }),
});

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    parsed = HoldSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "invalid request" }, { status: 400 });
  }
  const [staff, brand] = await Promise.all([
    getStaffBySlug(parsed.staffSlug),
    getBrandByKey(parsed.brandKey),
  ]);
  if (!staff || !brand) return jsonResponse({ error: "unknown staff" }, { status: 404 });
  const eventType = await getEventType(brand.id, parsed.eventTypeKey);
  if (!eventType) return jsonResponse({ error: "unknown event type" }, { status: 404 });
  const holdId = await createHold(staff.id, parsed.startIso, eventType.durationMin);
  return jsonResponse({ ok: true, holdId, expiresInSeconds: 120 });
}
