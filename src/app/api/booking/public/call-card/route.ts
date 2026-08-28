// GET /api/booking/public/call-card?tripRecord=<recXXX>[&type=<key>]
// The guest portal's "book a call" button: given the Airtable trip record of
// a guest's booking, returns the coordinating BM (public profile only), the
// brand look, and a ready-made booking URL. Read-only, no guest data in or
// out, CORS-open — safe to call from the portal's client or server.

import { resolveManager } from "@/lib/booking/routing";
import { guestEventTypeName } from "@/lib/booking/model";
import { getEventTypesForBrand } from "@/lib/booking/availability/service";
import { appUrl, jsonResponse } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tripRecord = url.searchParams.get("tripRecord");
  // Portal default: the Quick Chat (15-minute 1:1), decided 20 Aug.
  const typeKey = url.searchParams.get("type") ?? "chat";
  if (!tripRecord || !/^rec[A-Za-z0-9]+$/.test(tripRecord)) {
    return jsonResponse({ found: false, error: "tripRecord (Airtable record id) is required" }, { status: 400, headers: CORS });
  }

  const resolved = await resolveManager({ tripRecordId: tripRecord });
  if (resolved.kind === "unresolved") {
    return jsonResponse({ found: false }, { headers: CORS });
  }

  const eventTypes = (await getEventTypesForBrand(resolved.brand.id)).filter((t) => t.guestFacing && t.active);
  const eventType = eventTypes.find((t) => t.key === typeKey) ?? eventTypes[0] ?? null;
  const departure = resolved.departures[0] ?? null;

  const bookParams = new URLSearchParams({ tripRecord, source: "portal" });
  if (eventType) bookParams.set("type", eventType.key);

  return jsonResponse(
    {
      found: true,
      kind: resolved.kind,
      bookUrl: `${appUrl()}/book?${bookParams.toString()}`,
      trip: departure
        ? { title: departure.niceName ?? departure.tripName, startDate: departure.startDate }
        : null,
      brand: {
        key: resolved.brand.key,
        name: resolved.brand.name,
        logoUrl: resolved.brand.logoUrl,
        colorPrimary: resolved.brand.colorPrimary,
      },
      // Public profile only — the same fields the /book page shows guests.
      bm:
        resolved.kind === "primary"
          ? {
              firstName: resolved.staff.firstName,
              // Absolute for the portal (a different origin).
              photoUrl: resolved.staff.photoUrl?.startsWith("/")
                ? `${appUrl()}${resolved.staff.photoUrl}`
                : resolved.staff.photoUrl,
              bio: resolved.staff.bio,
            }
          : null,
      poolLabel: resolved.kind === "pool" ? `the ${resolved.brand.name} team` : null,
      callType: eventType
        ? { key: eventType.key, name: guestEventTypeName(eventType.key, eventType.name), durationMin: eventType.durationMin }
        : null,
    },
    { headers: CORS },
  );
}
