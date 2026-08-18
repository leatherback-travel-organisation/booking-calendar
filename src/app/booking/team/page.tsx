import type { Metadata } from "next";
import Link from "next/link";
import { BookingShell } from "@/components/booking/booking-shell";
import { TeamRoster } from "@/components/booking/team-roster";
import { requireBookingAccess } from "@/lib/booking/access";
import { databaseConfigured } from "@/lib/booking/db";
import { getBrands, getDepartureStats, getStaffWithBrands } from "@/lib/booking/reference/queries";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team · Calltime · Cove",
};

export default async function BookingTeamPage() {
  const { canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="team" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const [staff, brands, stats] = await Promise.all([getStaffWithBrands(), getBrands(), getDepartureStats()]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <BookingShell active="team" canManage={canManage}>
      <p style={{ margin: "0 0 14px", fontSize: "var(--text-small, 13px)" }}><Link href="/booking/team/sessions">Group sessions</Link> · <Link href="/booking/team/invitations">Invitations</Link></p>
      <TeamRoster staff={staff} brands={brands} fetchedAt={stats.fetchedAt} appUrl={appUrl} />
    </BookingShell>
  );
}
