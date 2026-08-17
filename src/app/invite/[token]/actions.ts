"use server";

import { redirect } from "next/navigation";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { acceptInvitation, findInvitationByToken } from "@/lib/booking/invitations";
import { appUrl, honeypotTripped } from "@/lib/booking/public-api";

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (honeypotTripped(formData.get("website"))) {
    redirect(`/invite/${token}?accepted=1`);
  }
  const chosenStartIso = String(formData.get("startIso") ?? "");
  const guestName = String(formData.get("guestName") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim() || null;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!chosenStartIso || !guestName || !guestEmail.includes("@") || !idempotencyKey) {
    redirect(`/invite/${token}?error=details`);
  }

  const invitation = await findInvitationByToken(token);
  if (!invitation || invitation.status !== "pending") {
    redirect(`/invite/${token}`);
  }
  const staff = await getStaffById(invitation.staffId);
  const eventType = await getEventTypeById(invitation.eventTypeId);
  const brand = staff?.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
  if (!staff || !eventType || !brand) redirect(`/invite/${token}`);

  const result = await acceptInvitation({
    invitation,
    staff,
    brand,
    eventType,
    chosenStartIso,
    guestName,
    guestEmail,
    guestPhone,
    idempotencyKey,
    appUrl: appUrl(),
  });

  if (!result.ok) {
    const reason = "reason" in result ? result.reason : "slot_invalid";
    redirect(`/invite/${token}?error=${reason}`);
  }
  redirect(result.manageUrl.replace(appUrl(), "") + "?welcome=1");
}
