// DEV ONLY: how many slot holds are sitting in the table right now. Used to
// verify that an abandoned scheduling request leaves nothing behind. Hard
// -gated to the PGlite dev database, exactly like the dev photo upload route.

import { NextResponse } from "next/server";
import { getSql } from "@/lib/booking/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (process.env.BOOKING_DEV_PGLITE !== "true" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const sql = getSql();
  const rows = await sql`select id, starts_at, expires_at from booking.slot_hold order by expires_at`;
  return NextResponse.json({ count: rows.length, holds: rows });
}
