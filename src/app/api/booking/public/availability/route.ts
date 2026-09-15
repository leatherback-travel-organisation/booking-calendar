// GET /api/booking/public/availability?staff=<slug>&brand=<key>&type=<key>
// The whole booking window in one response; the picker paginates client-side.

import { availabilityForStaff, getBrandByKey, getEventType, getStaffBySlug } from "@/lib/booking/availability/service";
import { clientIp, jsonResponse, rateLimited } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (await rateLimited("availability-ip", clientIp(request), 30, 60)) {
    return jsonResponse({ error: "rate_limited" }, { status: 429 });
  }
  const url = new URL(request.url);
  const staffSlug = url.searchParams.get("staff");
  const brandKey = url.searchParams.get("brand");
  const typeKey = url.searchParams.get("type");
  if (!staffSlug || !brandKey || !typeKey) {
    return jsonResponse({ error: "staff, brand and type are required" }, { status: 400 });
  }

  const [staff, brand] = await Promise.all([getStaffBySlug(staffSlug), getBrandByKey(brandKey)]);
  if (!staff || !brand) return jsonResponse({ error: "unknown staff or brand" }, { status: 404 });
  if (!staff.brandIds.includes(brand.id) && staff.primaryBrandId !== brand.id) {
    return jsonResponse({ error: "staff does not serve this brand" }, { status: 404 });
  }
  const eventType = await getEventType(brand.id, typeKey);
  if (!eventType || !eventType.guestFacing) return jsonResponse({ error: "unknown event type" }, { status: 404 });

  const availability = await availabilityForStaff({ staff, brand, eventType });
  return jsonResponse({
    staff: { slug: staff.slug, firstName: staff.firstName, photoUrl: staff.photoUrl },
    schedulingZone: availability.schedulingZone,
    calendarReachable: availability.calendarReachable,
    durationMin: eventType.durationMin,
    slots: availability.slots,
    windowEnd: availability.windowEnd,
  });
}
