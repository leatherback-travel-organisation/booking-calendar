import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { BackLink } from "@/components/booking/back-link";
import { BookingShell } from "@/components/booking/booking-shell";
import { SettingsSearch } from "@/components/booking/settings-search";
import {
  InvitationComposer,
  type InviteEventTypeOption,
  type InviteSlotOption,
  type InviteStaffOption,
} from "@/components/booking/team-tools/invitation-composer";
import { formatRelative } from "@/components/booking/dashboard/relative";
import { requireBookingAccess } from "@/lib/booking/access";
import {
  availabilityForStaff,
  getBrandById,
  getEventTypesForBrand,
} from "@/lib/booking/availability/service";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { calendarConfigured } from "@/lib/booking/google/auth";
import { getStaffWithBrands } from "@/lib/booking/reference/queries";
import type { EventType } from "@/lib/booking/model";
import { createInvitationAction } from "./actions";
import shellStyles from "@/components/booking/booking-shell.module.css";
import styles from "@/components/booking/team-tools/team-tools.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitations · CallTime · Cove",
};

const SLOT_LIMIT = 30;

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvitationsPage({ searchParams }: PageProps) {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="team" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const sp = await searchParams;
  const staffParam = typeof sp.staff === "string" ? sp.staff : undefined;
  const typeParam = typeof sp.type === "string" ? sp.type : undefined;

  const activeStaff = (await getStaffWithBrands()).filter((member) => member.active);
  const selfEmail = identity.email.toLowerCase();
  const self = activeStaff.find((member) => member.email.toLowerCase() === selfEmail) ?? null;
  const allowedStaff = canManage ? activeStaff : self ? [self] : [];

  const selected = allowedStaff.find((member) => member.id === staffParam) ?? self ?? allowedStaff[0] ?? null;

  let composer: React.ReactNode;
  if (!selected) {
    composer = (
      <p className={styles.mutedNote}>
        Your email ({identity.email}) is not on the Booking Manager roster, so you cannot send invitations.
      </p>
    );
  } else {
    const brand = selected.primaryBrandId ? await getBrandById(selected.primaryBrandId) : null;
    if (!brand) {
      composer = <p className={styles.mutedNote}>{selected.firstName} has no primary brand, so no availability exists.</p>;
    } else {
      const eventTypes = (await getEventTypesForBrand(brand.id)).filter((eventType) => eventType.active);
      const selectedType: EventType | null =
        eventTypes.find((eventType) => eventType.id === typeParam) ??
        eventTypes.find((eventType) => eventType.key === "enquiry") ??
        eventTypes[0] ??
        null;

      if (!selectedType) {
        composer = <p className={styles.mutedNote}>{brand.name} has no active event types.</p>;
      } else {
        let slots: InviteSlotOption[] | null = null;
        let slotsNote: string | null = null;
        let zone: string | null = null;
        if (!calendarConfigured()) {
          slotsNote = "Google Calendar is not connected — real availability cannot be shown.";
        } else {
          const availability = await availabilityForStaff({ staff: selected, brand, eventType: selectedType });
          zone = availability.schedulingZone;
          if (!availability.calendarReachable) {
            slotsNote = `${selected.firstName}'s calendar is unreachable — no verified availability to offer.`;
          } else {
            slots = availability.slots.slice(0, SLOT_LIMIT).map((slot) => ({
              start: slot.start,
              label: DateTime.fromISO(slot.start, { zone: availability.schedulingZone }).toFormat("ccc d LLL · h:mm a"),
            }));
            if (slots.length === 0) slotsNote = "No open slots in the booking window.";
          }
        }

        const staffOptions: InviteStaffOption[] = allowedStaff.map((member) => ({
          id: member.id,
          fullName: member.fullName,
          isSelf: member.email.toLowerCase() === selfEmail,
        }));
        const eventTypeOptions: InviteEventTypeOption[] = eventTypes.map((eventType) => ({
          id: eventType.id,
          name: eventType.name,
          durationMin: eventType.durationMin,
        }));

        composer = (
          <InvitationComposer
            staffOptions={staffOptions}
            selectedStaffId={selected.id}
            eventTypeOptions={eventTypeOptions}
            selectedEventTypeId={selectedType.id}
            zone={zone}
            slots={slots}
            slotsNote={slotsNote}
            action={createInvitationAction}
          />
        );
      }
    }
  }

  const sql = getSql();
  const recentRows = await sql`
    select i.id, i.guest_name, i.guest_email, i.status, i.expires_at, i.created_at,
           jsonb_array_length(i.candidates) as candidate_count,
           s.full_name as staff_name, et.name as event_type_name
    from booking.bm_invitation i
    join booking.staff s on s.id = i.staff_id
    join booking.event_type et on et.id = i.event_type_id
    order by i.created_at desc
    limit 10`;

  return (
    <BookingShell active="team" canManage={canManage}>
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <h2 className={styles.pageTitle}>Invitations</h2>
          <nav className={styles.crumbs} aria-label="Team tools">
            <BackLink href="/booking/team" label="Team" />
            <Link href="/booking/team/sessions" className={styles.crumbLink}>
              Group sessions
            </Link>
          </nav>
        </div>
        <p className={styles.pageIntro}>
          Propose a shortlist of times from a Booking Manager&rsquo;s real availability. The guest picks one — the
          invitation always books the same BM who sent it.
        </p>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>New invitation</h3>
          {composer}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Recent invitations</h3>
          {recentRows.length === 0 ? (
            <p className={styles.mutedNote}>No invitations yet.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.inviteTable}>
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>BM</th>
                    <th>Event type</th>
                    <th>Times</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td>{(row.guest_name as string | null) ?? (row.guest_email as string | null) ?? "—"}</td>
                      <td>{String(row.staff_name)}</td>
                      <td>{String(row.event_type_name)}</td>
                      <td>{Number(row.candidate_count)}</td>
                      <td>
                        <span className={styles.statusChip} data-status={String(row.status)}>
                          {String(row.status)}
                        </span>
                      </td>
                      <td>{formatRelative(new Date(row.created_at as string).toISOString())}</td>
                      <td>{DateTime.fromJSDate(new Date(row.expires_at as string)).toFormat("d LLLL yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <SettingsSearch />
    </BookingShell>
  );
}
