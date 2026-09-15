// DEV-ONLY photo drop for the local demo: accepts multipart uploads from the
// authenticated Notion browser session and stores them as demo staff photos.
// Hard-disabled unless the local PGlite demo database is in use — this route
// never exists in production behaviour.

import { writeFile, mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/booking/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_PATTERN = /^[a-z0-9-]{3,60}$/;

export async function POST(request: Request) {
  if (process.env.BOOKING_DEV_PGLITE !== "true" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const file = form.get("file");
  if (!SLUG_PATTERN.test(slug) || !(file instanceof Blob) || file.size < 2_000 || file.size > 10_000_000) {
    return NextResponse.json({ error: "bad upload" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  // Basic image sniff: JPEG, PNG or WebP magic bytes only.
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isWebp = bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    return NextResponse.json({ error: "not an image" }, { status: 400 });
  }
  const dir = `${process.cwd()}/public/demo-staff`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${slug}.jpg`, bytes);
  const sql = getSql();
  await sql`update booking.staff set photo_url = ${`/demo-staff/${slug}.jpg`} where slug = ${slug}`;
  return NextResponse.json({ ok: true, slug, size: bytes.length });
}
