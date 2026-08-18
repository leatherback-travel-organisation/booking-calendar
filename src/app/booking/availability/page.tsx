import type { Metadata } from "next";
import { DateTime } from "luxon";
import { BookingShell } from "@/components/booking/booking-shell";
import { AvailabilityEditor } from "@/components/booking/availability/availability-editor";
import { SettingsSearch } from "@/components/booking/settings-search";
import { requireBookingAccess } from "@/lib/booking/access";
import { resolveSchedulingZone } from "@/lib/booking/availability/engine";
import {
  availabilityForStaff,
  getBrandById,
  getEventType,
  getEventTypesForBrand,
  getWorkingHours,
} from "@/lib/booking/availability/service";
import { databaseConfigured } from "@/lib/booking/db";
import { calendarConfigured } from "@/lib/booking/google/auth";
import { getStaffWithBrands } from "@/lib/booking/reference/queries";
import { saveSettings, saveWorkingHours } from "./actions";
import shellStyles from "@/components/booking/booking-shell.module.css";
import styles from "@/components/booking/availability/availability.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Availability · Booking · Cove",
};

type Preview =
  | { kind: "slots"; labels: string[]; zone: string; eventTypeName: string; unreachable: boolean }
  | { kind: "message"; message: string };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingAvailabilityPage({ searchParams }: PageProps) {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="availability" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const sp = await searchParams;
  const staffParam = typeof sp.staff === "string" ? sp.staff : undefined;
  const savedFlag = typeof sp.saved === "string" ? sp.saved : null;

  const activeStaff = (await getStaffWithBrands()).filter((member) => member.active);
  if (activeStaff.length === 0) {
    return (
      <BookingShell active="availability" canManage={canManage}>
        <p className={shellStyles.placeholder}>No active Booking Managers yet — run the reference sync first.</p>
      </BookingShell>
    );
  }

  const selfEmail = identity.email.toLowerCase();
  const self = activeStaff.find((member) => member.email.toLowerCase() === selfEmail) ?? null;
  const selected = activeStaff.find((member) => member.id === staffParam) ?? self ?? activeStaff[0];
  const isSelf = selected.email.toLowerCase() === selfEmail;

  const brand = selected.primaryBrandId ? await getBrandById(selected.primaryBrandId) : null;
  const zone = brand ? resolveSchedulingZone(selected, brand) : (selected.timezoneOverride ?? "UTC");
  const zoneLabel = brand ? `${zone} (${brand.name} scheduling zone)` : zone;
  const hours = await getWorkingHours(selected.id);

  let preview: Preview;
  if (!brand) {
    preview = { kind: "message", message: `${selected.firstName} has no primary brand, so there is no guest booking page to preview.` };
  } else {
    let eventType = await getEventType(brand.id, "enquiry");
    if (!eventType) {
      const all = await getEventTypesForBrand(brand.id);
      eventType = all.find((candidate) => candidate.active && candidate.guestFacing) ?? null;
    }
    if (!eventType) {
      preview = { kind: "message", message: `${brand.name} has no guest-facing event type to preview.` };
    } else if (!calendarConfigured()) {
      preview = {
        kind: "message",
        message: "Google Calendar is not connected in this environment, so the live guest preview is unavailable.",
      };
    } else {
      const availability = await availabilityForStaff({ staff: selected, brand, eventType });
      preview = {
        kind: "slots",
        zone: availability.schedulingZone,
        eventTypeName: eventType.name,
        unreachable: !availability.calendarReachable,
        labels: availability.slots.slice(0, 5).map((slot) =>
          DateTime.fromISO(slot.start, { zone: availability.schedulingZone }).toFormat("ccc d LLL · h:mm a"),
        ),
      };
    }
  }

  return (
    <BookingShell active="availability" canManage={canManage}>
      <div className={styles.layout}>
        <AvailabilityEditor
          staffOptions={activeStaff.map((member) => ({
            id: member.id,
            fullName: member.fullName,
            isSelf: member.email.toLowerCase() === selfEmail,
          }))}
          selected={{
            id: selected.id,
            fullName: selected.fullName,
            email: selected.email,
            bufferMinutes: selected.bufferMinutes,
            minNoticeHours: selected.minNoticeHours,
            bookingWindowDays: selected.bookingWindowDays,
            timezoneOverride: selected.timezoneOverride,
            bio: selected.bio,
            remindersEnabled: selected.remindersEnabled,
          }}
          hours={hours}
          zoneLabel={zoneLabel}
          canManage={canManage}
          isSelf={isSelf}
          savedFlag={savedFlag}
          saveWorkingHoursAction={saveWorkingHours}
          saveSettingsAction={saveSettings}
        />
        <aside className={styles.preview} aria-label="Guest preview">
          <h2 className={styles.previewTitle}>What a guest sees right now</h2>
          {preview.kind === "message" ? (
            <p className={styles.previewNote}>{preview.message}</p>
          ) : (
            <>
              <p className={styles.previewNote}>
                Next open slots for {selected.firstName} · {preview.eventTypeName}, shown in {preview.zone}.
              </p>
              {preview.unreachable ? (
                <p className={styles.previewWarning}>
                  {selected.firstName}&rsquo;s calendar is unreachable — guests currently see no times at all.
                </p>
              ) : preview.labels.length === 0 ? (
                <p className={styles.previewNote}>No open slots in the booking window.</p>
              ) : (
                <ul className={styles.previewList}>
                  {preview.labels.map((label) => (
                    <li key={label} className={styles.previewSlot}>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>
      <SettingsSearch />
    </BookingShell>
  );
}
