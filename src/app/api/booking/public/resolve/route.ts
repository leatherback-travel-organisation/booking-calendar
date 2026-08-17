// GET /api/booking/public/resolve?trip=<slug>[&host=<host>] | ?bm=<slug>
// The entry point for the /book page: who is the guest booking with?

import { resolveManager } from "@/lib/booking/routing";
import { getBrands } from "@/lib/booking/reference/queries";
import { getEventTypesForBrand } from "@/lib/booking/availability/service";
import { jsonResponse, supportPhone } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const trip = url.searchParams.get("trip");
  const bm = url.searchParams.get("bm");
  const host = url.searchParams.get("host");

  if (!trip && !bm) {
    // No slug at all: give the brand list so the page can show a picker.
    const brands = await getBrands();
    return jsonResponse({
      kind: "brand-picker",
      brands: brands.map((b) => ({ key: b.key, name: b.name })),
    });
  }

  const resolved = await resolveManager(bm ? { bmSlug: bm } : { tripSlug: trip!, host });

  if (resolved.kind === "unresolved") {
    // Never an error page for the guest — fall back to the trip/brand picker
    // while the coverage map hears about the miss (§5.3 step 4).
    const brands = await getBrands();
    return jsonResponse({
      kind: "brand-picker",
      brands: brands.map((b) => ({ key: b.key, name: b.name })),
    });
  }

  const eventTypes = (await getEventTypesForBrand(resolved.brand.id)).filter((t) => t.guestFacing && t.active);
  const phone = supportPhone(resolved.brand, request);
  const common = {
    brand: {
      key: resolved.brand.key,
      name: resolved.brand.name,
      logoUrl: resolved.brand.logoUrl,
      colorPrimary: resolved.brand.colorPrimary,
      colorAccent: resolved.brand.colorAccent,
      phone,
    },
    eventTypes: eventTypes.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      durationMin: t.durationMin,
    })),
    departures: resolved.departures.map((d) => ({
      airtableId: d.airtableId,
      title: d.niceName ?? d.tripName,
      startDate: d.startDate,
      url: d.websiteUrl,
    })),
  };

  if (resolved.kind === "primary") {
    return jsonResponse({
      kind: "primary",
      ...common,
      staff: {
        slug: resolved.staff.slug,
        firstName: resolved.staff.firstName,
        bio: resolved.staff.bio,
        photoUrl: resolved.staff.photoUrl,
      },
    });
  }

  return jsonResponse({ kind: "pool", ...common, poolLabel: `Book a call with the ${resolved.brand.name} team` });
}
