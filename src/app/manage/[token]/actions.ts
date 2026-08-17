"use server";

// Guest self-service actions for /manage/[token]. Every action re-derives the
// booking from the raw token — nothing is trusted from the client beyond it.

import {
  bookingManageable,
  cancelBooking,
  findBookingByToken,
  rescheduleBooking,
  type BookingContext,
  type ManagedBooking,
} from "@/lib/booking/service";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { appUrl } from "@/lib/booking/public-api";

type Loaded = { booking: ManagedBooking; ctx: BookingContext };

async function loadByToken(token: string): Promise<Loaded | null> {
  const booking = await findBookingByToken(token);
  if (!booking) return null;
  const [staff, brand, eventType] = await Promise.all([
    getStaffById(booking.staffId),
    getBrandById(booking.brandId),
    getEventTypeById(booking.eventTypeId),
  ]);
  if (!staff || !brand || !eventType) return null;
  return { booking, ctx: { staff, brand, eventType } };
}

export async function cancelBookingAction(token: string): Promise<{ ok: boolean }> {
  const loaded = await loadByToken(token);
  if (!loaded || !bookingManageable(loaded.booking)) return { ok: false };
  return cancelBooking(loaded.booking, loaded.ctx, "guest");
}

export type RescheduleActionResult =
  | { ok: true; startIso: string; endIso: string }
  | { ok: false; reason: "slot_taken" | "slot_invalid" | "not_manageable" };

export async function rescheduleBookingAction(
  token: string,
  newStartIso: string,
): Promise<RescheduleActionResult> {
  const loaded = await loadByToken(token);
  if (!loaded || !bookingManageable(loaded.booking)) return { ok: false, reason: "not_manageable" };
  return rescheduleBooking(loaded.booking, loaded.ctx, newStartIso, appUrl(), token);
}
