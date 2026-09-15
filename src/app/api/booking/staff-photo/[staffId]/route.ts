// GET /api/booking/staff-photo/[staffId] — serves a BM's profile photo from
// the team's PRIVATE Vercel Blob store (public uploads are rejected there,
// so the sync stores privately and this route is the public face). Photos
// are already public content — they appear on guest booking pages.
//
// A `staff-photo-override:<id>` cache row can point at a hand-cropped file
// in public/ instead: some synced Notion photos are wide landscape shots
// that show mostly background once cropped to a circle. The roster sync
// never writes that key, so re-syncing cannot silently undo the framing.

import { getSql } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3,4}-[0-9a-f]{3,4}-[0-9a-f]{12}$/i;
const CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(
  _request: Request,
  context: { params: Promise<{ staffId: string }> },
): Promise<Response> {
  const { staffId } = await context.params;
  if (!UUID.test(staffId)) return new Response("Not found", { status: 404 });

  const sql = getSql();
  const rows = await sql`
    select key, payload from booking.reference_cache
    where key in (${`staff-photo-override:${staffId}`}, ${`staff-photo:${staffId}`})`;

  // A same-origin path only: never let cached data redirect off-site.
  const override = rows.find((row) => String(row.key).startsWith("staff-photo-override:"))?.payload as
    | { path?: string }
    | null
    | undefined;
  const path = override?.path;
  if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) {
    return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": CACHE } });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response("Not found", { status: 404 });

  const payload = rows.find((row) => String(row.key).startsWith("staff-photo:"))?.payload as
    | { blobUrl?: string; contentType?: string }
    | null
    | undefined;
  if (!payload?.blobUrl) return new Response("Not found", { status: 404 });

  const blob = await fetch(payload.blobUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!blob.ok) return new Response("Not found", { status: 404 });

  return new Response(blob.body, {
    status: 200,
    headers: {
      "Content-Type": payload.contentType ?? "image/jpeg",
      "Cache-Control": CACHE,
    },
  });
}
