"use server";

// Click-to-dial server action. The caller must be the booking's own BM or a
// Pod Lead — nobody dials a guest on someone else's behalf by accident.

import { requireBookingAccess } from "@/lib/booking/access";
import { aircallConfigured, dialGuest } from "@/lib/booking/aircall";
import { getSql } from "@/lib/booking/db";

export async function startCallAction(bookingId: string): Promise<{ ok: boolean; message: string }> {
  const { identity, canManage } = await requireBookingAccess("booking.read");
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) return { ok: false, message: "Unknown booking." };

  const sql = getSql();
  const rows = await sql`
    select b.id, b.guest_phone, b.guest_name, s.email as staff_email, s.aircall_user_id,
           br.phone_au, br.phone_nz, br.phone_default
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.brand br on br.id = b.brand_id
    where b.id = ${bookingId}`;
  if (rows.length === 0) return { ok: false, message: "Unknown booking." };
  const row = rows[0];

  const isOwnBooking = String(row.staff_email).toLowerCase() === identity.email.toLowerCase();
  if (!isOwnBooking && !canManage) {
    return { ok: false, message: "Only this booking's BM (or a Pod Lead) can start the call." };
  }

  const result = await dialGuest({
    aircallUserId: (row.aircall_user_id as string | null) ?? null,
    guestPhone: (row.guest_phone as string | null) ?? null,
    actorEmail: identity.email,
    bookingId,
    // NZ guests are called from the brand's NZ line, AU guests from AU.
    lines: {
      phoneAu: (row.phone_au as string | null) ?? null,
      phoneNz: (row.phone_nz as string | null) ?? null,
      phoneDefault: (row.phone_default as string | null) ?? null,
    },
  });

  if (!result.ok) {
    if (result.reason === "no_phone") return { ok: false, message: "This guest didn't leave a phone number." };
    if (result.reason === "no_aircall_user") return { ok: false, message: "No Aircall user id for this BM — add it in Airtable and re-sync." };
    return { ok: false, message: result.detail ?? "Aircall couldn't start the call." };
  }
  if (result.stubbed || !aircallConfigured()) {
    return { ok: true, message: `Aircall isn't connected yet — the call to ${String(row.guest_name)} was recorded but not dialled.` };
  }
  return { ok: true, message: "Ringing your Aircall now — the guest connects when you pick up." };
}
