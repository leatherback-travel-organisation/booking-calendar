// Presentational dashboard for /booking. All data is computed server-side in
// the page; this component just lays it out, Cove-quiet.

import Link from "next/link";
import type { CoverageIssueRow } from "@/lib/booking/reference/queries";
import { AvailabilityCalendar, type CalendarSection } from "./availability-calendar";
import { CopySchedulingLinkButton } from "./copy-scheduling-link";
import { formatRelative } from "./relative";
import { CallButton } from "./call-button";
import styles from "./dashboard.module.css";

export type DashboardBooking = {
  id: string;
  timeLabel: string;
  guestName: string;
  bmFirstName: string;
  bmPhotoUrl: string | null;
  eventTypeName: string;
  brandName: string;
  routedVia: string;
  /** Show click-to-dial: guest left a phone AND the viewer may start it. */
  canCall: boolean;
};

export type RecentBooking = {
  id: string;
  createdAtIso: string;
  guestName: string;
  bmFirstName: string;
  bmPhotoUrl: string | null;
  eventTypeName: string;
  brandName: string;
  sourceKind: string;
  status: string;
};

// booking.source_kind values: trip/contact/portal are guest self-booked
// surfaces; bm/invite/session are BM-initiated.
const SOURCE_LABEL: Record<string, string> = {
  trip: "self-booked · trip",
  contact: "self-booked · contact",
  portal: "self-booked · portal",
  bm: "BM-entered",
  invite: "BM shortlist",
  session: "group seat",
};

/** Small round BM avatar for booking rows, with an initial-circle fallback. */
function BmAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.rowAvatar} src={photoUrl} alt="" title={name} />;
  }
  return (
    <span className={styles.rowAvatar} data-fallback="true" title={name} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function BookingList({ bookings, emptyLabel }: { bookings: DashboardBooking[]; emptyLabel: string }) {
  if (bookings.length === 0) {
    return <p className={styles.emptyNote}>{emptyLabel}</p>;
  }
  return (
    <ul className={styles.bookingList}>
      {bookings.map((booking) => (
        <li key={booking.id} className={styles.bookingRow}>
          <span className={styles.bookingTime}>{booking.timeLabel}</span>
          <span className={styles.bookingGuest}>{booking.guestName}</span>
          <span className={styles.bookingMeta}>
            {booking.bmFirstName} · {booking.eventTypeName}
          </span>
          <span className={styles.brandChip}>{booking.brandName}</span>
          {booking.routedVia !== "primary" ? <span className={styles.routedBadge}>{booking.routedVia}</span> : null}
          {booking.canCall ? <CallButton bookingId={booking.id} /> : null}
          <BmAvatar name={booking.bmFirstName} photoUrl={booking.bmPhotoUrl} />
        </li>
      ))}
    </ul>
  );
}

type DashboardProps = {
  issues: CoverageIssueRow[];
  today: DashboardBooking[];
  week: DashboardBooking[];
  recent: RecentBooking[];
  calendar: CalendarSection;
  /** The signed-in BM's own guest booking URL; null when they have no active staff row. */
  schedulingLinkUrl: string | null;
};

export function Dashboard({ issues, today, week, recent, calendar, schedulingLinkUrl }: DashboardProps) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity !== "error");

  return (
    <div className={styles.dashboard}>
      {errors.length > 0 ? (
        <section className={styles.alertBanner} aria-label="Coverage issues needing attention">
          <div className={styles.alertHead}>
            <strong>
              {errors.length} coverage {errors.length === 1 ? "issue needs" : "issues need"} attention
            </strong>
            <Link href="/booking/routing" className={styles.alertLink}>
              Open routing
            </Link>
          </div>
          <ul className={styles.alertList}>
            {errors.slice(0, 5).map((issue) => (
              <li key={issue.id}>{issue.message}</li>
            ))}
            {errors.length > 5 ? <li>…and {errors.length - 5} more.</li> : null}
          </ul>
        </section>
      ) : warnings.length > 0 ? (
        <section className={styles.warningBanner}>
          <span>
            {warnings.length} coverage {warnings.length === 1 ? "warning" : "warnings"} open.
          </span>
          <Link href="/booking/routing" className={styles.alertLink}>
            Open routing
          </Link>
        </section>
      ) : null}

      <div className={styles.actionsRow}>
        <Link href="/booking/team/sessions" className={styles.primaryAction}>
          Create group session
        </Link>
        {schedulingLinkUrl ? (
          <CopySchedulingLinkButton url={schedulingLinkUrl} />
        ) : (
          <Link href="/booking/team" className={styles.secondaryAction} title="Per-BM copy buttons live on the Team page">
            Copy scheduling link
          </Link>
        )}
      </div>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Today</h2>
          <BookingList bookings={today} emptyLabel="No confirmed calls today." />
          <h2 className={styles.panelTitle}>Rest of this week</h2>
          <BookingList bookings={week} emptyLabel="Nothing else confirmed this week." />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent bookings</h2>
          {recent.length === 0 ? (
            <p className={styles.emptyNote}>No bookings yet.</p>
          ) : (
            <ul className={styles.recentList}>
              {recent.map((booking) => (
                <li key={booking.id} className={styles.recentRow}>
                  <BmAvatar name={booking.bmFirstName} photoUrl={booking.bmPhotoUrl} />
                  <div className={styles.recentMain}>
                    <span className={styles.bookingGuest}>{booking.guestName}</span>
                    <span className={styles.bookingMeta}>
                      {booking.bmFirstName} · {booking.eventTypeName} · {booking.brandName}
                    </span>
                  </div>
                  <div className={styles.recentSide}>
                    <span className={styles.sourceChip} data-source={booking.sourceKind}>
                      {SOURCE_LABEL[booking.sourceKind] ?? booking.sourceKind}
                    </span>
                    <span className={styles.recentWhen}>{formatRelative(booking.createdAtIso)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AvailabilityCalendar
        options={calendar.options}
        selectedSlug={calendar.selectedSlug}
        view={calendar.view}
      />
    </div>
  );
}
