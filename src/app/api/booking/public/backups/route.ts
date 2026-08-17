// GET /api/booking/public/backups?brand=<key>&type=<key>&exclude=<staffSlug>
// Computed LAZILY — only when the guest clicks "Can't find a time that
// works?". Ranked by real calendar availability; the guest chooses. This is
// ordering, never assignment.

import { getBrandByKey, getEventType, getStaffBySlug, rankBackups } from "@/lib/booking/availability/service";
import { clientIp, jsonResponse, rateLimited } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (await rateLimited("backups-ip", clientIp(request), 10, 60)) {
    return jsonResponse({ error: "rate_limited" }, { status: 429 });
  }
  const url = new URL(request.url);
  const brandKey = url.searchParams.get("brand");
  const typeKey = url.searchParams.get("type");
  const excludeSlug = url.searchParams.get("exclude");
  if (!brandKey || !typeKey) return jsonResponse({ error: "brand and type are required" }, { status: 400 });

  const brand = await getBrandByKey(brandKey);
  if (!brand) return jsonResponse({ error: "unknown brand" }, { status: 404 });
  const eventType = await getEventType(brand.id, typeKey);
  if (!eventType || !eventType.guestFacing) return jsonResponse({ error: "unknown event type" }, { status: 404 });
  const exclude = excludeSlug ? await getStaffBySlug(excludeSlug) : null;

  const ranked = await rankBackups({
    brand,
    eventType,
    excludeStaffId: exclude?.id ?? "00000000-0000-0000-0000-000000000000",
  });

  return jsonResponse({
    backups: ranked.map((entry) => ({
      staff: {
        slug: entry.staff.slug,
        firstName: entry.staff.firstName,
        photoUrl: entry.staff.photoUrl,
        bio: entry.staff.bio,
      },
      openSlotCount: entry.openSlotCount,
      firstSlot: entry.firstSlot,
    })),
  });
}
