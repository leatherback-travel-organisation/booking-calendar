"use server";

// Move a booked call to a different Booking Manager (Nicola, 17 Sep):
// unplanned leave, a colleague takes the call. Pod Leads move any call to
// anyone; the floating BM moves any call onto themselves. The rule lives in
// canMoveBooking; the work in moveBooking.

import { revalidatePath } from "next/cache";
import { requireBookingAccess } from "@/lib/booking/access";
import { getBrandById, getEventTypeById, getStaffByEmail, getStaffById } from "@/lib/booking/availability/service";
import { canMoveBooking } from "@/lib/booking/calltime-calendar";
import { getBookingById, moveBooking } from "@/lib/booking/service";
import { appUrl } from "@/lib/booking/public-api";

export async function moveBookingAction(
  bookingId: string,
  toStaffId: string,
): Promise<{ ok: boolean; message: string }> {
  const { identity, canManage } = await requireBookingAccess("booking.read");
  if (!/^[0-9a-f-]{36}$/.test(bookingId) || !/^[0-9a-f-]{36}$/.test(toStaffId)) {
    return { ok: false, message: "Unknown booking or Booking Manager." };
  }
  const booking = await getBookingById(bookingId);
  if (!booking || booking.status !== "confirmed") return { ok: false, message: "That booking can't be moved." };
  const [staff, brand, eventType, target, self] = await Promise.all([
    getStaffById(booking.staffId),
    getBrandById(booking.brandId),
    getEventTypeById(booking.eventTypeId),
    getStaffById(toStaffId),
    getStaffByEmail(identity.email),
  ]);
  if (!staff || !brand || !eventType || !target) return { ok: false, message: "That booking can't be moved." };
  if (!canMoveBooking({ viewer: { canManage, staff: self }, target, currentStaffId: booking.staffId })) {
    return { ok: false, message: "You can't move this call to that Booking Manager." };
  }
  const result = await moveBooking(booking, { staff, brand, eventType }, target, identity.email, appUrl());
  revalidatePath("/booking");
  if (result.ok) return { ok: true, message: `Moved to ${target.firstName}. The guest has been emailed.` };
  switch (result.reason) {
    case "slot_taken":
      return { ok: false, message: `${target.firstName} is busy at that time.` };
    case "same_bm":
      return { ok: false, message: "That's already their call." };
    case "not_manageable":
      return { ok: false, message: "That booking can't be moved any more." };
    default:
      return { ok: false, message: "The calendar didn't cooperate; the move was not made." };
  }
}
