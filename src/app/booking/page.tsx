import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { requireBookingAccess } from "@/lib/booking/access";
import styles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking · Cove",
  description: "Guest call scheduling for Booking Managers.",
};

export default async function BookingDashboardPage() {
  const { canManage } = await requireBookingAccess("booking.read");
  return (
    <BookingShell active="dashboard" canManage={canManage}>
      <p className={styles.placeholder}>
        Bookings today, coverage issues and the availability heat strip will appear here.
      </p>
    </BookingShell>
  );
}
