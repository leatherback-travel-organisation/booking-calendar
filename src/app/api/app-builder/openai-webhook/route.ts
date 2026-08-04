import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { continueAppBuilderResponse } from "@/lib/app-builder/queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  if (!verify(request.headers, body)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  const event = JSON.parse(body) as { type?: string; data?: { id?: string } };
  const responseId = event.data?.id;
  if (responseId && event.type && ["response.completed", "response.failed", "response.incomplete"].includes(event.type)) {
    after(() => continueAppBuilderResponse(responseId, event.type!));
  }
  return NextResponse.json({ ok: true });
}

function verify(headers: Headers, body: string) {
  const rawSecret = process.env.OPENAI_WEBHOOK_SECRET?.trim();
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!rawSecret || !id || !timestamp || !signatures) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  try {
    const secret = Buffer.from(rawSecret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest();
    return signatures.split(" ").some((entry) => {
      if (!entry.startsWith("v1,")) return false;
      const supplied = Buffer.from(entry.slice(3), "base64");
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    });
  } catch { return false; }
}
