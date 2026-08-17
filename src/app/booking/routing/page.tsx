import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { BookingShell } from "@/components/booking/booking-shell";
import { CoverageMap } from "@/components/booking/coverage-map";
import { requireBookingAccess } from "@/lib/booking/access";
import { databaseConfigured } from "@/lib/booking/db";
import { getDepartureStats, getOpenCoverageIssues } from "@/lib/booking/reference/queries";
import { runReferenceSync } from "@/lib/booking/reference/sync";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Routing · Booking · Cove",
};

async function runSyncNow() {
  "use server";
  await requireBookingAccess("booking.manage");
  await runReferenceSync();
  revalidatePath("/booking/routing");
  revalidatePath("/booking/team");
}

export default async function BookingRoutingPage() {
  const { canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="routing" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const [issues, stats] = await Promise.all([getOpenCoverageIssues(), getDepartureStats()]);

  return (
    <BookingShell active="routing" canManage={canManage}>
      <CoverageMap issues={issues} stats={stats} canManage={canManage} runSyncAction={runSyncNow} />
    </BookingShell>
  );
}
