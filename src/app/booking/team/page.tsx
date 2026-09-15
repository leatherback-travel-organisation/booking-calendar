import type { Metadata } from "next";
import Link from "next/link";
import { BookingShell } from "@/components/booking/booking-shell";
import { TeamRoster } from "@/components/booking/team-roster";
import { requireBookingAccess } from "@/lib/booking/access";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { appUrl as publicAppUrl } from "@/lib/booking/app-url";
import { getBrands, getDepartureStats, getPods, getStaffWithBrands } from "@/lib/booking/reference/queries";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team · CallTime · Cove",
};

export default async function BookingTeamPage() {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="team" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const [staff, brands, stats, pods] = await Promise.all([getStaffWithBrands(), getBrands(), getDepartureStats(), getPods()]);
  const appUrl = publicAppUrl();
  // One copy link per guest-bookable call type, same set for every BM.
  const sql = getSql();
  const typeRows = await sql`
    select key, min(name) as name, min(position) as position
    from booking.event_type where guest_facing and active
    group by key order by position`;
  const guestTypes = typeRows.map((row) => ({ key: String(row.key), name: String(row.name) }));

  return (
    <BookingShell active="team" canManage={canManage}>
      <p style={{ margin: "0 0 14px", fontSize: "var(--text-small, 13px)" }}><Link href="/booking/team/sessions">Group sessions</Link> · <Link href="/booking/team/invitations">Invitations</Link></p>
      <TeamRoster
        staff={staff}
        brands={brands}
        fetchedAt={stats.fetchedAt}
        appUrl={appUrl}
        guestTypes={guestTypes}
        pods={pods}
        canManage={canManage}
        viewerEmail={identity.email}
      />
    </BookingShell>
  );
}
