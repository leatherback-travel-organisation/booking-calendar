"use server";

// Group-session actions. Permission rule (enforced here, not in the UI):
// Pod Leads act for anyone; a Booking Manager only for themselves.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireBookingAccess } from "@/lib/booking/access";
import { resolveSchedulingZone } from "@/lib/booking/availability/engine";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { cancelGroupSession, createGroupSession, getSession } from "@/lib/booking/groups";

export async function createSessionAction(formData: FormData): Promise<void> {
  const access = await requireBookingAccess("booking.read");

  const staff = await getStaffById(String(formData.get("staffId") ?? ""));
  if (!staff || !staff.active) throw new Error("Unknown staff member.");
  if (!access.canManage && staff.email.toLowerCase() !== access.identity.email.toLowerCase()) {
    throw new Error("You can only create group sessions for yourself.");
  }

  const eventType = await getEventTypeById(String(formData.get("eventTypeId") ?? ""));
  if (!eventType || !eventType.active || !eventType.supportsGroup) {
    throw new Error("Pick a group-capable event type.");
  }
  const brand = await getBrandById(eventType.brandId);
  if (!brand) throw new Error("Unknown brand.");
  if (staff.primaryBrandId !== brand.id && !staff.brandIds.includes(brand.id)) {
    throw new Error(`${staff.firstName} does not work ${brand.name}.`);
  }

  const capacity = Number(formData.get("capacity"));
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 50) {
    redirect("/booking/team/sessions?error=capacity");
  }

  // datetime-local values carry no zone: interpret them in the brand's
  // scheduling zone (what the form label promises).
  const zone = resolveSchedulingZone(staff, brand);
  const raw = String(formData.get("start") ?? "").slice(0, 16);
  const start = DateTime.fromFormat(raw, "yyyy-LL-dd'T'HH:mm", { zone });
  if (!start.isValid || start.toMillis() <= Date.now()) {
    redirect("/booking/team/sessions?error=start");
  }

  const result = await createGroupSession({
    staff,
    brand,
    eventType,
    startIso: start.toUTC().toISO() ?? "",
    capacity,
    actorEmail: access.identity.email,
  });

  revalidatePath("/booking/team/sessions");
  if (!result.ok) {
    redirect(`/booking/team/sessions?error=${result.reason}`);
  }
  redirect(`/booking/team/sessions?created=${result.sessionId}`);
}

export async function cancelSessionAction(formData: FormData): Promise<void> {
  const access = await requireBookingAccess("booking.read");

  const session = await getSession(String(formData.get("sessionId") ?? ""));
  if (!session) throw new Error("Unknown session.");
  const staff = await getStaffById(session.staffId);
  if (!staff) throw new Error("Unknown staff member.");
  if (!access.canManage && staff.email.toLowerCase() !== access.identity.email.toLowerCase()) {
    throw new Error("Only the owning Booking Manager or a Pod Lead can cancel this session.");
  }
  const eventType = await getEventTypeById(session.eventTypeId);
  const brand = eventType ? await getBrandById(eventType.brandId) : null;
  if (!eventType || !brand) throw new Error("Session is missing its event type or brand.");

  await cancelGroupSession({ session, staff, brand, eventType, actorEmail: access.identity.email });
  revalidatePath("/booking/team/sessions");
  redirect("/booking/team/sessions?cancelled=1");
}
