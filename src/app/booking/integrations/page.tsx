import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { requireBookingAccess } from "@/lib/booking/access";
import styles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations · Booking · Cove",
};

export default async function BookingIntegrationsPage() {
  const { canManage } = await requireBookingAccess("booking.manage");
  return (
    <BookingShell active="integrations" canManage={canManage}>
      <p className={styles.placeholder}>Integrations is coming in a later phase.</p>
    </BookingShell>
  );
}
