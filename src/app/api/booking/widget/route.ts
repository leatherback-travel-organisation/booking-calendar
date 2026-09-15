// GET /api/booking/widget?brand=<key>&trip=<slug>&host=<hostname>
//
// The card payload for the embedded trip-page widget (/embed.js). Cross-origin
// by design — the script runs on Tourism Tiger brand sites — so CORS is
// allowlisted from booking.brand_domain, never "*". Every unhappy path returns
// 200 {kind:'none'} so the widget silently renders nothing instead of ever
// surfacing an error on a guest-facing trip page.

import { resolveManager } from "@/lib/booking/routing";
import { getBrandByKey } from "@/lib/booking/availability/service";
import { appUrl, supportPhone } from "@/lib/booking/public-api";
import { getSql } from "@/lib/booking/db";
import type { Brand } from "@/lib/booking/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

/**
 * Echo the request Origin only when its hostname (minus www.) is a known
 * brand domain (booking.brand_domain). Any scheme is accepted; the wildcard
 * never is. Returns the header map to merge into the response.
 */
async function corsHeaders(request: Request): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Vary: "Origin" };
  const originHeader = request.headers.get("origin");
  if (!originHeader) return headers;
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return headers;
  }
  try {
    const sql = getSql();
    const rows = await sql`select host from booking.brand_domain`;
    const allowed = rows.some(
      (row) => String(row.host).toLowerCase().replace(/^www\./, "") === hostname,
    );
    if (allowed) headers["Access-Control-Allow-Origin"] = originHeader;
  } catch {
    // Allowlist unreadable → no CORS header; the widget fails silently.
  }
  return headers;
}

function payloadResponse(body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": CACHE_CONTROL,
      ...cors,
    },
  });
}

/** The widget renders on brand sites, so path-only URLs must be absolute. */
function absolute(url: string | null): string | null {
  return url?.startsWith("/") ? `${appUrl()}${url}` : url;
}

function brandPayload(brand: Brand) {
  return {
    key: brand.key,
    name: brand.name,
    colorPrimary: brand.colorPrimary,
    colorAccent: brand.colorAccent,
    logoUrl: absolute(brand.logoUrl),
  };
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = await corsHeaders(request);
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const cors = await corsHeaders(request);
  try {
    const url = new URL(request.url);
    const brandKey = url.searchParams.get("brand")?.trim() ?? "";
    const trip = url.searchParams.get("trip")?.trim() ?? "";
    const host = url.searchParams.get("host")?.trim() || null;

    if (!brandKey && !trip) return payloadResponse({ kind: "none" }, cors);

    const resolved = trip
      ? await resolveManager({ tripSlug: trip, host })
      : ({ kind: "unresolved" } as const);

    if (resolved.kind === "primary") {
      return payloadResponse(
        {
          kind: "primary",
          staff: {
            firstName: resolved.staff.firstName,
            bio: resolved.staff.bio,
            photoUrl: absolute(resolved.staff.photoUrl),
            slug: resolved.staff.slug,
          },
          brand: brandPayload(resolved.brand),
          phone: supportPhone(resolved.brand, request),
        },
        cors,
      );
    }

    if (resolved.kind === "pool") {
      return payloadResponse(
        {
          kind: "pool",
          brand: brandPayload(resolved.brand),
          phone: supportPhone(resolved.brand, request),
        },
        cors,
      );
    }

    // Unresolved trip (or a non-trip page): fall back to the brand from the
    // script tag. A brand fronted by exactly one primary BM goes STRAIGHT to
    // them — never a picker (Nicola, 1 Sep); their backups already surface
    // through "see who else can help" when they have no times. Only a brand
    // with several primaries keeps the pool, and `bookQuery` pins the
    // overlay to the brand so guests never see the all-brands picker.
    if (!brandKey) return payloadResponse({ kind: "none" }, cors);
    const brand = await getBrandByKey(brandKey);
    if (!brand) return payloadResponse({ kind: "none" }, cors);
    const sql = getSql();
    const primaries = await sql`
      select s.slug, s.first_name, s.bio, s.photo_url
        from booking.staff s
        join booking.staff_brand sb on sb.staff_id = s.id
       where sb.brand_id = ${brand.id} and s.active and not sb.is_backup`;
    if (primaries.length === 1) {
      const solo = primaries[0];
      return payloadResponse(
        {
          kind: "primary",
          staff: {
            firstName: String(solo.first_name),
            bio: solo.bio == null ? null : String(solo.bio),
            photoUrl: absolute(solo.photo_url == null ? null : String(solo.photo_url)),
            slug: String(solo.slug),
          },
          brand: brandPayload(brand),
          phone: supportPhone(brand, request),
          bookQuery: `bm=${encodeURIComponent(String(solo.slug))}&brand=${encodeURIComponent(brand.key)}`,
        },
        cors,
      );
    }
    return payloadResponse(
      {
        kind: "pool",
        brand: brandPayload(brand),
        phone: supportPhone(brand, request),
        bookQuery: `brand=${encodeURIComponent(brand.key)}`,
      },
      cors,
    );
  } catch {
    return payloadResponse({ kind: "none" }, cors);
  }
}
