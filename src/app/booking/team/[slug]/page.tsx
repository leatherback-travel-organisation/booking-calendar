// One Booking Manager's own page: their week calendar (mirroring Google
// Calendar), upcoming booked calls, and their availability settings —
// editable by the BM themselves (server actions enforce the permission
// split). This replaces the old standalone Availability page.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { BackLink } from "@/components/booking/back-link";
import { BookingShell } from "@/components/booking/booking-shell";
import { AvailabilityEditor } from "@/components/booking/availability/availability-editor";
import { AvailabilityCalendar } from "@/components/booking/dashboard/availability-calendar";
import { BookingList, type DashboardBooking } from "@/components/booking/dashboard/dashboard";
import { SettingsSearch } from "@/components/booking/settings-search";
import { requireBookingAccess } from "@/lib/booking/access";
import { resolveSchedulingZone } from "@/lib/booking/availability/engine";
import { getBrandById, getWorkingHours } from "@/lib/booking/availability/service";
import { buildCalendarView } from "@/lib/booking/calendar-view";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { getStaffWithBrands } from "@/lib/booking/reference/queries";
import { saveSettings, saveWorkingHours } from "./actions";
import shellStyles from "@/components/booking/booking-shell.module.css";
import dashStyles from "@/components/booking/dashboard/dashboard.module.css";
import styles from "./bm-page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team · CallTime · Cove",
};

function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

async function loadUpcoming(
  staffId: string,
  viewer: { email: string; canManage: boolean },
  staffEmail: string,
): Promise<DashboardBooking[]> {
  const sql = getSql();
  const rows = await sql`
    select b.id, b.starts_at, b.guest_name, b.guest_phone, b.routed_via,
           s.first_name, s.photo_url, s.timezone_override,
           et.name as event_type_name,
           br.name as brand_name, br.color_primary as brand_color, br.scheduling_timezone
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.event_type et on et.id = b.event_type_id
    join booking.brand br on br.id = b.brand_id
    where b.staff_id = ${staffId} and b.status = 'confirmed'
      and b.starts_at >= now()
    order by b.starts_at
    limit 40`;
  const ownPage = staffEmail.toLowerCase() === viewer.email.toLowerCase();
  return rows.map((row) => {
    const zone = (row.timezone_override as string | null) ?? String(row.scheduling_timezone);
    const dt = DateTime.fromISO(new Date(row.starts_at as string).toISOString(), { zone });
    const isToday = dt.hasSame(DateTime.now().setZone(zone), "day");
    return {
      id: String(row.id),
      timeLabel: isToday ? `Today · ${dt.toFormat("h:mm a")}` : dt.toFormat("ccc d LLL · h:mm a"),
      guestName: String(row.guest_name),
      bmFirstName: String(row.first_name),
      bmPhotoUrl: (row.photo_url as string | null) ?? null,
      eventTypeName: String(row.event_type_name),
      brandName: String(row.brand_name),
      brandColor: (row.brand_color as string | null) ?? null,
      routedVia: String(row.routed_via),
      canCall: Boolean((row.guest_phone as string | null)?.trim()) && (ownPage || viewer.canManage),
    };
  });
}

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingManagerPage({ params, searchParams }: PageProps) {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="team" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const { slug } = await params;
  const sp = await searchParams;
  const savedFlag = typeof sp.saved === "string" ? sp.saved : null;

  const allStaff = await getStaffWithBrands();
  const staff = allStaff.find((member) => member.slug === slug && member.active);
  if (!staff) notFound();

  const isSelf = staff.email.toLowerCase() === identity.email.toLowerCase();

  // BMs see only their own page; switching between BM views is Pod Lead only.
  if (!canManage && !isSelf) {
    const own = allStaff.find(
      (member) => member.active && member.email.toLowerCase() === identity.email.toLowerCase(),
    );
    redirect(own ? `/booking/team/${own.slug}` : "/booking/team");
  }
  const brand = staff.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
  const zone = brand ? resolveSchedulingZone(staff, brand) : (staff.timezoneOverride ?? "UTC");
  const zoneLabel = brand ? `${zone} (${brand.name} scheduling zone)` : zone;

  const [hours, upcoming, calendarView] = await Promise.all([
    getWorkingHours(staff.id),
    loadUpcoming(staff.id, { email: identity.email, canManage }, staff.email),
    buildCalendarView(staff),
  ]);

  return (
    <BookingShell active="team" canManage={canManage}>
      <div className={styles.page}>
        <BackLink href="/booking/team" label="Team" />

        <header className={styles.header}>
          {staff.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.photo} src={staff.photoUrl} alt="" />
          ) : (
            <span className={styles.photoFallback} aria-hidden="true">
              {initials(staff.fullName)}
            </span>
          )}
          <div>
            <h2 className={styles.name}>
              {staff.fullName}
              {isSelf ? <span className={styles.youTag}> (you)</span> : null}
            </h2>
            <p className={styles.meta}>
              {staff.email}
              {brand ? ` · ${brand.name}` : ""}
            </p>
          </div>
        </header>

        <AvailabilityCalendar options={[]} selectedSlug={null} view={calendarView} />

        <section className={dashStyles.panel}>
          <h2 className={dashStyles.panelTitle}>Upcoming calls</h2>
          <BookingList
            bookings={upcoming}
            emptyLabel={`No confirmed calls coming up for ${staff.firstName}.`}
          />
        </section>

        <AvailabilityEditor
          selected={{
            id: staff.id,
            fullName: staff.fullName,
            email: staff.email,
            bufferMinutes: staff.bufferMinutes,
            minNoticeHours: staff.minNoticeHours,
            bookingWindowDays: staff.bookingWindowDays,
            timezoneOverride: staff.timezoneOverride,
            bio: staff.bio,
            reminder24hEnabled: staff.reminder24hEnabled,
            reminder1hEnabled: staff.reminder1hEnabled,
            videoCallsEnabled: staff.videoCallsEnabled,
          }}
          hours={hours}
          zoneLabel={zoneLabel}
          canManage={canManage}
          isSelf={isSelf}
          savedFlag={savedFlag}
          saveWorkingHoursAction={saveWorkingHours}
          saveSettingsAction={saveSettings}
        />
      </div>
      <SettingsSearch />
    </BookingShell>
  );
}
