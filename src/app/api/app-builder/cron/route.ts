import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listActiveAppBuilderTargetAssetIds } from "@/lib/app-builder/server";
import { reconcileAppBuilderWork } from "@/lib/app-builder/queue";

export const runtime = "nodejs";
export const maxDuration = 300;

// Scheduled recovery sweep (vercel.json crons). The browser reconcile poll
// only runs while someone has App Builder open; this keeps stalled requests,
// missed webhooks, and pending publishes moving on their own.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const targetAssetIds = await listActiveAppBuilderTargetAssetIds();
    await reconcileAppBuilderWork(targetAssetIds);
    return NextResponse.json({ ok: true, targets: targetAssetIds.length });
  } catch (error) {
    console.error("[app-builder] cron reconcile failed", error);
    return NextResponse.json({ error: "reconcile failed" }, { status: 500 });
  }
}
