// POST /api/booking/public/book — the actual booking creation.
// Layers, in order: honeypot, Turnstile, fresh free/busy re-verification,
// and finally the Postgres exclusion constraint as the real guarantee.

import { z } from "zod";
import { getBrandByKey, getEventType, getStaffBySlug } from "@/lib/booking/availability/service";
import { createBooking } from "@/lib/booking/service";
import { appUrl, clientIp, honeypotTripped, jsonResponse, rateLimited, supportPhone, verifyTurnstile } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BookSchema = z.object({
  staffSlug: z.string().min(1).max(100),
  brandKey: z.string().min(1).max(50),
  eventTypeKey: z.string().min(1).max(50),
  startIso: z.string().datetime({ offset: true }),
  guestName: z.string().trim().min(1).max(200),
  guestEmail: z.string().trim().email().max(320),
  guestPhone: z.string().trim().max(50).optional(),
  guestNotes: z.string().trim().max(2000).optional(),
  guestTimezone: z.string().max(64).optional(),
  callMedium: z.enum(["video", "phone"]).default("video"),
  sourceKind: z.enum(["trip", "bm", "contact", "portal"]).default("bm"),
  sourceSlug: z.string().max(200).optional(),
  routedVia: z.enum(["primary", "backup", "pool"]).default("primary"),
  routedReason: z.string().max(500).optional(),
  airtableTripRecordId: z.string().regex(/^rec[A-Za-z0-9]+$/).optional(),
  tripName: z.string().max(300).optional(),
  tripUrl: z.string().url().max(500).optional(),
  idempotencyKey: z.string().uuid(),
  turnstileToken: z.string().max(4096).optional(),
  /** Honeypot — humans never see this field. */
  website: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    parsed = BookSchema.parse(await request.json());
  } catch {
    return jsonResponse({ error: "invalid request" }, { status: 400 });
  }

  if (parsed.callMedium === "phone" && !parsed.guestPhone?.trim()) {
    return jsonResponse(
      { error: "phone_required", message: "A phone number is needed so we can call you." },
      { status: 400 },
    );
  }

  if (honeypotTripped(parsed.website)) {
    // Silently pretend success — do not teach the bot what failed.
    return jsonResponse({ ok: true });
  }
  const ip = clientIp(request);
  if (
    (await rateLimited("book-ip", ip, 10, 60)) ||
    (await rateLimited("book-email", parsed.guestEmail, 3, 3600))
  ) {
    return jsonResponse({ error: "rate_limited", message: "Too many requests — please try again shortly." }, { status: 429 });
  }
  if (!(await verifyTurnstile(parsed.turnstileToken ?? null, clientIp(request)))) {
    return jsonResponse({ error: "verification failed" }, { status: 403 });
  }

  const [staff, brand] = await Promise.all([
    getStaffBySlug(parsed.staffSlug),
    getBrandByKey(parsed.brandKey),
  ]);
  if (!staff || !brand) return jsonResponse({ error: "unknown staff or brand" }, { status: 404 });
  if (parsed.callMedium === "video" && !staff.videoCallsEnabled) {
    // The UI never offers video for these BMs; a direct API call gets the
    // honest answer instead of a Meet link the BM didn't sign up for.
    return jsonResponse(
      { error: "video_unavailable", message: `${staff.firstName} takes these calls by phone — please book a phone call.` },
      { status: 400 },
    );
  }
  const eventType = await getEventType(brand.id, parsed.eventTypeKey);
  if (!eventType || !eventType.guestFacing) return jsonResponse({ error: "unknown event type" }, { status: 404 });

  const result = await createBooking({
    staff,
    brand,
    eventType,
    startIso: parsed.startIso,
    guestName: parsed.guestName,
    guestEmail: parsed.guestEmail,
    guestPhone: parsed.guestPhone ?? null,
    guestNotes: parsed.guestNotes ?? null,
    guestTimezone: parsed.guestTimezone ?? null,
    callMedium: parsed.callMedium,
    sourceKind: parsed.sourceKind,
    sourceSlug: parsed.sourceSlug ?? null,
    routedVia: parsed.routedVia,
    routedReason: parsed.routedReason ?? null,
    airtableTripRecordId: parsed.airtableTripRecordId ?? null,
    tripName: parsed.tripName ?? null,
    tripUrl: parsed.tripUrl ?? null,
    idempotencyKey: parsed.idempotencyKey,
    appUrl: appUrl(),
  });

  if (!result.ok) {
    const status = result.reason === "slot_taken" ? 409 : result.reason === "calendar_failed" ? 502 : 422;
    return jsonResponse(
      {
        error: result.reason,
        message:
          result.reason === "slot_taken"
            ? "That time was just taken — here are fresh options."
            : result.reason === "calendar_failed"
              ? `We couldn't confirm the calendar just now. Please try again, or call us on ${supportPhone(brand, request) ?? "our support line"}.`
              : "That time isn't bookable.",
      },
      { status },
    );
  }

  return jsonResponse({
    ok: true,
    bookingId: result.bookingId,
    manageUrl: result.manageUrl,
    meetUrl: result.meetUrl,
    startIso: result.startIso,
    endIso: result.endIso,
  });
}
