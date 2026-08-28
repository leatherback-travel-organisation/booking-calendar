// GET /api/booking/brand-avatar/[brandKey] — the brand's square avatar from
// the Brands base "Avatar" field, blob-hosted by the reference sync and
// served here (the store is private). Addressed by brand KEY so guest pages
// can build the URL without a database read.

import { getSql } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = /^[a-z0-9-]{1,60}$/;
const CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(
  _request: Request,
  context: { params: Promise<{ brandKey: string }> },
): Promise<Response> {
  const { brandKey } = await context.params;
  if (!KEY.test(brandKey)) return new Response("Not found", { status: 404 });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response("Not found", { status: 404 });

  const sql = getSql();
  const rows = await sql`
    select c.payload
      from booking.brand b
      join booking.reference_cache c on c.key = 'brand-avatar:' || b.id
     where b.key = ${brandKey}`;
  const payload = (rows[0]?.payload ?? null) as { blobUrl?: string; contentType?: string } | null;
  if (!payload?.blobUrl) return new Response("Not found", { status: 404 });

  const blob = await fetch(payload.blobUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!blob.ok) return new Response("Not found", { status: 404 });

  return new Response(blob.body, {
    status: 200,
    headers: { "Content-Type": payload.contentType ?? "image/png", "Cache-Control": CACHE },
  });
}
