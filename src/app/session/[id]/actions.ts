"use server";

import { redirect } from "next/navigation";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { claimSeat, getSession } from "@/lib/booking/groups";
import { appUrl, honeypotTripped } from "@/lib/booking/public-api";

export async function claimSeatAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (honeypotTripped(formData.get("website"))) {
    redirect(`/session/${sessionId}?claimed=1`); // pretend success to bots
  }
  const guestName = String(formData.get("guestName") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim() || null;
  const guestTimezone = String(formData.get("guestTimezone") ?? "").trim() || null;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!guestName || !guestEmail.includes("@") || !idempotencyKey) {
    redirect(`/session/${sessionId}?error=details`);
  }

  const session = await getSession(sessionId);
  if (!session) redirect("/book");
  const [staff, eventType] = await Promise.all([
    getStaffById(session.staffId),
    getEventTypeById(session.eventTypeId),
  ]);
  const brand = staff?.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
  if (!staff || !eventType || !brand) redirect("/book");

  const result = await claimSeat({
    session,
    staff,
    brand,
    eventType,
    guestName,
    guestEmail,
    guestPhone,
    guestTimezone,
    idempotencyKey,
    appUrl: appUrl(),
  });

  if (!result.ok) {
    redirect(`/session/${sessionId}?error=${result.reason}`);
  }
  redirect(result.manageUrl.replace(appUrl(), "") + "?welcome=1");
}
