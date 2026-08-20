import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { BookingShell } from "@/components/booking/booking-shell";
import {
  Dashboard,
  type DashboardBooking,
  type DayGroup,
  type RecentBooking,
  type SchedulingPageLink,
} from "@/components/booking/dashboard/dashboard";
import { SettingsSearch } from "@/components/booking/settings-search";
import { requireBookingAccess } from "@/lib/booking/access";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { getBrands, getOpenCoverageIssues, getPods, getStaffWithBrands } from "@/lib/booking/reference/queries";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CallTime · Cove",
  description: "Guest call scheduling for Booking Managers.",
};

type WeekRow = Record<string, unknown>;

function mapWeekBooking(
  row: WeekRow,
  viewer: { email: string; canManage: boolean },
): { booking: DashboardBooking; dayKey: string; dayLabel: string } {
  const zone = (row.timezone_override as string | null) ?? String(row.scheduling_timezone);
  const dt = DateTime.fromISO(new Date(row.starts_at as string).toISOString(), { zone });
  const isToday = dt.hasSame(DateTime.now().setZone(zone), "day");
  const hasPhone = Boolean((row.guest_phone as string | null)?.trim());
  const ownBooking = String(row.staff_email).toLowerCase() === viewer.email.toLowerCase();
  return {
    booking: {
      id: String(row.id),
      timeLabel: dt.toFormat("h:mm a"),
      guestName: String(row.guest_name),
      bmFirstName: String(row.first_name),
      bmPhotoUrl: (row.photo_url as string | null) ?? null,
      eventTypeName: String(row.event_type_name),
      brandName: String(row.brand_name),
      brandColor: (row.brand_color as string | null) ?? null,
      routedVia: String(row.routed_via),
      canCall: hasPhone && (ownBooking || viewer.canManage),
    },
    dayKey: dt.toFormat("yyyy-LL-dd"),
    dayLabel: isToday ? "Today" : dt.toFormat("cccc d LLL"),
  };
}

/** Upcoming confirmed bookings for the next 7 days, grouped by day. */
async function loadWeekByDay(
  viewer: { email: string; canManage: boolean },
  brandIds: string[] | null,
): Promise<DayGroup[]> {
  const sql = getSql();
  const rows = await sql`
    select b.id, b.starts_at, b.guest_name, b.guest_phone, b.routed_via,
           s.first_name, s.photo_url, s.timezone_override, s.email as staff_email,
           et.name as event_type_name,
           br.name as brand_name, br.color_primary as brand_color, br.scheduling_timezone
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.event_type et on et.id = b.event_type_id
    join booking.brand br on br.id = b.brand_id
    where b.status = 'confirmed'
      and b.starts_at >= date_trunc('day', now())
      and b.starts_at < date_trunc('day', now()) + interval '7 days'
      and (${brandIds === null} or b.brand_id = any(${brandIds ?? []}))
    order by b.starts_at
    limit 80`;
  // "Today" always leads, even with no calls, so the empty state is explicit.
  const todayKey = DateTime.now().toFormat("yyyy-LL-dd");
  const groups = new Map<string, DayGroup>([[todayKey, { key: todayKey, label: "Today", bookings: [] }]]);
  for (const row of rows) {
    const mapped = mapWeekBooking(row, viewer);
    const group = groups.get(mapped.dayKey) ?? { key: mapped.dayKey, label: mapped.dayLabel, bookings: [] };
    group.bookings.push(mapped.booking);
    groups.set(mapped.dayKey, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function loadRecent(brandIds: string[] | null): Promise<RecentBooking[]> {
  const sql = getSql();
  const rows = await sql`
    select b.id, b.created_at, b.guest_name, b.source_kind, b.status,
           s.first_name, s.photo_url, et.name as event_type_name, br.name as brand_name
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.event_type et on et.id = b.event_type_id
    join booking.brand br on br.id = b.brand_id
    where (${brandIds === null} or b.brand_id = any(${brandIds ?? []}))
    order by b.created_at desc
    limit 10`;
  return rows.map((row) => ({
    id: String(row.id),
    createdAtIso: new Date(row.created_at as string).toISOString(),
    guestName: String(row.guest_name),
    bmFirstName: String(row.first_name),
    bmPhotoUrl: (row.photo_url as string | null) ?? null,
    eventTypeName: String(row.event_type_name),
    brandName: String(row.brand_name),
    sourceKind: String(row.source_kind),
    status: String(row.status),
  }));
}

export default async function BookingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="dashboard" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  // The dashboard is a Pod Lead surface; BMs land on their own team page.
  if (!canManage) {
    const own = (await getStaffWithBrands()).find(
      (member) => member.active && member.email.toLowerCase() === identity.email.toLowerCase(),
    );
    redirect(own ? `/booking/team/${own.slug}` : "/booking/team");
  }

  const sp = await searchParams;
  const brandParam = typeof sp.brand === "string" ? sp.brand : null;
  const podParam = typeof sp.pod === "string" ? sp.pod : null;

  const [brands, pods] = await Promise.all([getBrands(), getPods()]);
  const activeBrand = brandParam ? (brands.find((b) => b.active && b.key === brandParam) ?? null) : null;
  const activePod = !activeBrand && podParam ? (pods.find((p) => p.key === podParam) ?? null) : null;
  const filterBrandIds = activeBrand ? [activeBrand.id] : activePod ? activePod.brandIds : null;

  const [issues, days, recent, staff] = await Promise.all([
    getOpenCoverageIssues(),
    loadWeekByDay({ email: identity.email, canManage }, filterBrandIds),
    loadRecent(filterBrandIds),
    getStaffWithBrands(),
  ]);

  const selfEmail = identity.email.toLowerCase();
  const activeStaff = staff
    .filter((member) => member.active)
    // The brand/pod filter scopes this panel too — only BMs serving one of
    // the filtered brands keep their chip.
    .filter((member) => filterBrandIds === null || member.brandIds.some((id) => filterBrandIds.includes(id)))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const self = activeStaff.find((member) => member.email.toLowerCase() === selfEmail) ?? null;

  const schedulingPages: SchedulingPageLink[] = activeStaff.map((member) => ({
    slug: member.slug,
    fullName: member.fullName,
    photoUrl: member.photoUrl,
    isSelf: member.email.toLowerCase() === selfEmail,
  }));

  // "Copy scheduling link" copies the signed-in BM's own guest booking URL;
  // anyone without an active staff row is pointed at the per-BM buttons on
  // the Team page instead.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const schedulingLinkUrl = self ? `${appUrl}/book?bm=${encodeURIComponent(self.slug)}&type=enquiry` : null;

  return (
    <BookingShell active="dashboard" canManage={canManage}>
      <Dashboard
        issues={issues}
        days={days}
        recent={recent}
        schedulingPages={schedulingPages}
        schedulingLinkUrl={schedulingLinkUrl}
        filters={{
          brands: brands
            .filter((brand) => brand.active)
            .map((brand) => ({ key: brand.key, name: brand.name, colorPrimary: brand.colorPrimary })),
          pods: pods.map((pod) => ({ key: pod.key, name: pod.name })),
          activeBrandKey: activeBrand?.key ?? null,
          activePodKey: activePod?.key ?? null,
        }}
      />
      <SettingsSearch />
    </BookingShell>
  );
}
