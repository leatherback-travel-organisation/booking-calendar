// GET /api/booking/brand-logo/[brandId] — serves a brand logo from
// the team's PRIVATE Vercel Blob store (public uploads are rejected there,
// so the sync stores privately and this route is the public face). Photos
// are already public content — they appear on guest booking pages.

import { getSql } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3,4}-[0-9a-f]{3,4}-[0-9a-f]{12}$/i;
const CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(
  _request: Request,
  context: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  const { brandId } = await context.params;
  if (!UUID.test(brandId)) return new Response("Not found", { status: 404 });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response("Not found", { status: 404 });

  const sql = getSql();
  const rows = await sql`
    select payload from booking.reference_cache
    where key = ${`brand-logo:${brandId}`}`;
  const payload = (rows[0]?.payload ?? null) as { blobUrl?: string; contentType?: string } | null;
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
