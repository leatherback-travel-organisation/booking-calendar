import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireBookingAccess } from "@/lib/booking/access";
import { runReferenceSync } from "@/lib/booking/reference/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CronAuth = "ok" | "unauthorized" | "unconfigured";

function checkCronAuth(request: Request): CronAuth {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "unconfigured";
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return "unauthorized";
  }
  return "ok";
}

async function runAndRespond() {
  try {
    const summary = await runReferenceSync();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[booking] reference sync failed", error);
    return NextResponse.json({ error: "reference sync failed" }, { status: 500 });
  }
}

// Scheduled sync (vercel.json crons).
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (auth !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return runAndRespond();
}

// Manual trigger: either the cron secret, or a signed-in Pod Lead session.
export async function POST(request: Request) {
  if (checkCronAuth(request) === "ok") return runAndRespond();
  try {
    await requireBookingAccess("booking.manage");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runAndRespond();
}
