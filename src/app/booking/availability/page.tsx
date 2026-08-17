import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { requireBookingAccess } from "@/lib/booking/access";
import styles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Availability · Booking · Cove",
};

export default async function BookingAvailabilityPage() {
  const { canManage } = await requireBookingAccess("booking.read");
  return (
    <BookingShell active="availability" canManage={canManage}>
      <p className={styles.placeholder}>Availability is coming in a later phase.</p>
    </BookingShell>
  );
}
