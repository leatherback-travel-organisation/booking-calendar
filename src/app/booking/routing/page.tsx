import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { requireBookingAccess } from "@/lib/booking/access";
import styles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Routing · Booking · Cove",
};

export default async function BookingRoutingPage() {
  const { canManage } = await requireBookingAccess("booking.read");
  return (
    <BookingShell active="routing" canManage={canManage}>
      <p className={styles.placeholder}>Routing is coming in a later phase.</p>
    </BookingShell>
  );
}
