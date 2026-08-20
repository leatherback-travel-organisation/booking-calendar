import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { BackLink } from "@/components/booking/back-link";
import { BookingShell } from "@/components/booking/booking-shell";
import { SettingsSearch } from "@/components/booking/settings-search";
import { CancelSessionButton } from "@/components/booking/team-tools/cancel-session-button";
import { CopyButton } from "@/components/booking/team-tools/copy-button";
import {
  SessionForm,
  type SessionEventTypeOption,
  type SessionStaffOption,
} from "@/components/booking/team-tools/session-form";
import { requireBookingAccess } from "@/lib/booking/access";
import { resolveSchedulingZone } from "@/lib/booking/availability/engine";
import { databaseConfigured, getSql } from "@/lib/booking/db";
import { listOpenSessions } from "@/lib/booking/groups";
import { getBrands, getStaffWithBrands } from "@/lib/booking/reference/queries";
import { cancelSessionAction, createSessionAction } from "./actions";
import shellStyles from "@/components/booking/booking-shell.module.css";
import styles from "@/components/booking/team-tools/team-tools.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Group sessions · CallTime · Cove",
};

const ERROR_COPY: Record<string, string> = {
  capacity: "Capacity must be between 2 and 50 seats.",
  start: "Pick a valid start time in the future.",
  invalid: "That session could not be created — check the time and capacity.",
  calendar_failed: "The Google Calendar event could not be created, so the session was not published.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GroupSessionsPage({ searchParams }: PageProps) {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="team" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const sp = await searchParams;
  const createdId = typeof sp.created === "string" ? sp.created : null;
  const errorCode = typeof sp.error === "string" ? sp.error : null;
  const cancelled = sp.cancelled === "1";
  const staffSlugParam = typeof sp.staff === "string" ? sp.staff : null;

  const [sessions, staff, brands] = await Promise.all([listOpenSessions(), getStaffWithBrands(), getBrands()]);
  const sql = getSql();
  const eventTypeRows = await sql`
    select id, brand_id, key, name, duration_min, supports_group, active from booking.event_type`;

  const staffById = new Map(staff.map((member) => [member.id, member]));
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const eventTypeById = new Map(
    eventTypeRows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        brandId: String(row.brand_id),
        name: String(row.name),
        durationMin: Number(row.duration_min),
        supportsGroup: Boolean(row.supports_group),
        active: Boolean(row.active),
      },
    ]),
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cove.leatherbacktravel.com";
  const selfEmail = identity.email.toLowerCase();

  const activeStaff = staff.filter((member) => member.active);
  const self = activeStaff.find((member) => member.email.toLowerCase() === selfEmail) ?? null;
  const formStaff: SessionStaffOption[] = (canManage ? activeStaff : self ? [self] : []).map((member) => ({
    id: member.id,
    fullName: member.fullName,
    primaryBrandId: member.primaryBrandId,
    isSelf: member.email.toLowerCase() === selfEmail,
  }));

  // ?staff=<slug> (from the team roster's "Create group session") preselects
  // that BM — only when they are actually offered in the form.
  const preselected = staffSlugParam ? activeStaff.find((member) => member.slug === staffSlugParam) : undefined;
  const defaultStaffId =
    preselected && formStaff.some((option) => option.id === preselected.id) ? preselected.id : null;

  const groupEventTypes: SessionEventTypeOption[] = [...eventTypeById.values()]
    .filter((eventType) => eventType.supportsGroup && eventType.active)
    .map(({ id, brandId, name, durationMin }) => ({ id, brandId, name, durationMin }));

  const zoneByStaffId: Record<string, string> = {};
  for (const member of activeStaff) {
    const brand = member.primaryBrandId ? brandById.get(member.primaryBrandId) : null;
    if (brand) zoneByStaffId[member.id] = resolveSchedulingZone(member, brand);
  }

  return (
    <BookingShell active="team" canManage={canManage}>
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <h2 className={styles.pageTitle}>Group sessions</h2>
          <nav className={styles.crumbs} aria-label="Team tools">
            <BackLink href="/booking/team" label="Team" />
            <Link href="/booking/team/invitations" className={styles.crumbLink}>
              Invitations
            </Link>
          </nav>
        </div>

        {createdId ? (
          <div className={styles.successBanner}>
            <strong>Session created.</strong>
            <p className={styles.shareUrl}>{`${appUrl}/session/${createdId}`}</p>
            <div className={styles.inlineRow}>
              <CopyButton value={`${appUrl}/session/${createdId}`} />
              <span className={styles.mutedNote}>Share this link anywhere guests should claim a seat.</span>
            </div>
          </div>
        ) : null}
        {cancelled ? <div className={styles.successBanner}>Session cancelled — booked guests have been emailed.</div> : null}
        {errorCode ? <div className={styles.errorBanner}>{ERROR_COPY[errorCode] ?? "Something went wrong."}</div> : null}

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Upcoming sessions</h3>
          {sessions.length === 0 ? (
            <p className={styles.mutedNote}>No upcoming group sessions.</p>
          ) : (
            <ul className={styles.sessionList}>
              {sessions.map((session) => {
                const owner = staffById.get(session.staffId);
                const eventType = eventTypeById.get(session.eventTypeId);
                const brand = eventType ? brandById.get(eventType.brandId) : undefined;
                const zone = owner && brand ? resolveSchedulingZone(owner, brand) : "UTC";
                const when = DateTime.fromISO(session.startsAt, { zone }).toFormat("ccc d LLL · h:mm a");
                const shareUrl = `${appUrl}/session/${session.id}`;
                const canCancel = canManage || (owner ? owner.email.toLowerCase() === selfEmail : false);
                return (
                  <li key={session.id} className={styles.sessionRow}>
                    <div className={styles.sessionMain}>
                      <span className={styles.sessionWhen}>
                        {when} <span className={styles.sessionMeta}>({zone})</span>
                      </span>
                      <span className={styles.sessionMeta}>
                        {owner?.fullName ?? "Unknown BM"} · {eventType?.name ?? "Unknown event type"}
                        {brand ? ` · ${brand.name}` : ""}
                      </span>
                    </div>
                    <div className={styles.sessionSide}>
                      <span className={styles.seats}>
                        {session.seatsTaken}/{session.capacity} seats
                      </span>
                      <span className={styles.statusChip} data-status={session.status}>
                        {session.status}
                      </span>
                      <CopyButton value={shareUrl} />
                      {canCancel ? (
                        <CancelSessionButton sessionId={session.id} seatsTaken={session.seatsTaken} action={cancelSessionAction} />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.panel} id="create">
          <h3 className={styles.panelTitle}>New group session</h3>
          {formStaff.length === 0 ? (
            <p className={styles.mutedNote}>
              Your email ({identity.email}) is not on the Booking Manager roster, so you cannot publish sessions.
            </p>
          ) : (
            <SessionForm
              staffOptions={formStaff}
              eventTypes={groupEventTypes}
              zoneByStaffId={zoneByStaffId}
              defaultStaffId={defaultStaffId}
              action={createSessionAction}
            />
          )}
        </section>
      </div>
      <SettingsSearch />
    </BookingShell>
  );
}
