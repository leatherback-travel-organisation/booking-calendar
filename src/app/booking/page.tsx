import type { Metadata } from "next";
import { DateTime } from "luxon";
import { BookingShell } from "@/components/booking/booking-shell";
import {
  Dashboard,
  type DashboardBooking,
  type HeatDay,
  type HeatRow,
  type HeatStrip,
  type RecentBooking,
} from "@/components/booking/dashboard/dashboard";
import { SettingsSearch } from "@/components/booking/settings-search";
import { requireBookingAccess } from "@/lib/booking/access";
import {
  availabilityForStaff,
  getBrandById,
  getEventType,
  getEventTypesForBrand,
} from "@/lib/booking/availability/service";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { calendarConfigured } from "@/lib/booking/google/auth";
import { getOpenCoverageIssues, getStaffWithBrands } from "@/lib/booking/reference/queries";
import type { Staff } from "@/lib/booking/model";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calltime · Cove",
  description: "Guest call scheduling for Booking Managers.",
};

const HEAT_DAYS = 14;
const HEAT_MAX_STAFF = 20;

type WeekRow = Record<string, unknown>;

function mapWeekBooking(row: WeekRow): { booking: DashboardBooking; isToday: boolean } {
  const zone = (row.timezone_override as string | null) ?? String(row.scheduling_timezone);
  const dt = DateTime.fromISO(new Date(row.starts_at as string).toISOString(), { zone });
  const isToday = dt.hasSame(DateTime.now().setZone(zone), "day");
  return {
    booking: {
      id: String(row.id),
      timeLabel: isToday ? dt.toFormat("h:mm a") : dt.toFormat("ccc d · h:mm a"),
      guestName: String(row.guest_name),
      bmFirstName: String(row.first_name),
      bmPhotoUrl: (row.photo_url as string | null) ?? null,
      eventTypeName: String(row.event_type_name),
      brandName: String(row.brand_name),
      routedVia: String(row.routed_via),
    },
    isToday,
  };
}

async function loadWeek(): Promise<{ today: DashboardBooking[]; week: DashboardBooking[] }> {
  const sql = getSql();
  const rows = await sql`
    select b.id, b.starts_at, b.guest_name, b.routed_via,
           s.first_name, s.photo_url, s.timezone_override,
           et.name as event_type_name,
           br.name as brand_name, br.scheduling_timezone
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.event_type et on et.id = b.event_type_id
    join booking.brand br on br.id = b.brand_id
    where b.status = 'confirmed'
      and b.starts_at >= date_trunc('day', now())
      and b.starts_at < date_trunc('day', now()) + interval '7 days'
    order by b.starts_at
    limit 80`;
  const today: DashboardBooking[] = [];
  const week: DashboardBooking[] = [];
  for (const row of rows) {
    const mapped = mapWeekBooking(row);
    (mapped.isToday ? today : week).push(mapped.booking);
  }
  return { today, week };
}

async function loadRecent(): Promise<RecentBooking[]> {
  const sql = getSql();
  const rows = await sql`
    select b.id, b.created_at, b.guest_name, b.source_kind, b.status,
           s.first_name, s.photo_url, et.name as event_type_name, br.name as brand_name
    from booking.booking b
    join booking.staff s on s.id = b.staff_id
    join booking.event_type et on et.id = b.event_type_id
    join booking.brand br on br.id = b.brand_id
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

function heatDaysFor(zone: string): HeatDay[] {
  const start = DateTime.now().setZone(zone).startOf("day");
  const days: HeatDay[] = [];
  for (let i = 0; i < HEAT_DAYS; i += 1) {
    const day = start.plus({ days: i });
    days.push({
      key: day.toFormat("yyyy-LL-dd"),
      letter: day.toFormat("ccc").charAt(0),
      label: day.toFormat("ccc d"),
      count: 0,
    });
  }
  return days;
}

async function buildHeatStrip(activeStaff: Staff[]): Promise<HeatStrip> {
  if (!calendarConfigured()) {
    return { kind: "placeholder", message: "Google Calendar is not connected — open-slot counts are unavailable." };
  }
  if (activeStaff.length > HEAT_MAX_STAFF) {
    return {
      kind: "placeholder",
      message: `Too many active Booking Managers (${activeStaff.length}) to compute the heat strip in one pass.`,
    };
  }

  const rows: HeatRow[] = [];
  let header: HeatDay[] | null = null;

  // One availabilityForStaff call per BM — it computes the whole window in a
  // single pass; we bucket the slots by day in the brand's scheduling zone.
  for (const staff of activeStaff) {
    const brand = staff.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
    if (!brand) {
      rows.push({ staffId: staff.id, name: staff.firstName, days: null, note: "No primary brand set." });
      continue;
    }
    let eventType = await getEventType(brand.id, "enquiry");
    if (!eventType) {
      const all = await getEventTypesForBrand(brand.id);
      eventType = all.find((candidate) => candidate.active && candidate.guestFacing) ?? null;
    }
    if (!eventType) {
      rows.push({ staffId: staff.id, name: staff.firstName, days: null, note: "No guest-facing event type." });
      continue;
    }
    const availability = await availabilityForStaff({ staff, brand, eventType });
    if (!availability.calendarReachable) {
      rows.push({ staffId: staff.id, name: staff.firstName, days: null, note: "Calendar unreachable." });
      continue;
    }
    const days = heatDaysFor(availability.schedulingZone);
    const countByKey = new Map(days.map((day) => [day.key, 0]));
    for (const slot of availability.slots) {
      const key = DateTime.fromISO(slot.start, { zone: availability.schedulingZone }).toFormat("yyyy-LL-dd");
      if (countByKey.has(key)) countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
    }
    const counted = days.map((day) => ({ ...day, count: countByKey.get(day.key) ?? 0 }));
    if (!header) header = counted;
    rows.push({ staffId: staff.id, name: staff.firstName, days: counted, note: null });
  }

  if (rows.length === 0) {
    return { kind: "placeholder", message: "No active Booking Managers." };
  }
  return { kind: "ready", header: header ?? heatDaysFor("UTC"), rows };
}

export default async function BookingDashboardPage() {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="dashboard" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const [issues, weekData, recent, staff] = await Promise.all([
    getOpenCoverageIssues(),
    loadWeek(),
    loadRecent(),
    getStaffWithBrands(),
  ]);
  const heat = await buildHeatStrip(staff.filter((member) => member.active));

  // "Copy scheduling link" copies the signed-in BM's own guest booking URL;
  // anyone without an active staff row is pointed at the per-BM buttons on
  // the Team page instead.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const selfEmail = identity.email.toLowerCase();
  const self = staff.find((member) => member.active && member.email.toLowerCase() === selfEmail) ?? null;
  const schedulingLinkUrl = self ? `${appUrl}/book?bm=${encodeURIComponent(self.slug)}&type=enquiry` : null;

  return (
    <BookingShell active="dashboard" canManage={canManage}>
      <Dashboard
        issues={issues}
        today={weekData.today}
        week={weekData.week}
        recent={recent}
        heat={heat}
        schedulingLinkUrl={schedulingLinkUrl}
      />
      <SettingsSearch />
    </BookingShell>
  );
}
