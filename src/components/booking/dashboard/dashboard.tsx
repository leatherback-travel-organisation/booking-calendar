// Presentational dashboard for /booking. All data is computed server-side in
// the page; this component just lays it out, Cove-quiet.

import Link from "next/link";
import type { CoverageIssueRow } from "@/lib/booking/reference/queries";
import { BrandTag } from "../brand-tag";
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
  brandColor: string | null;
  routedVia: string;
  /** Show click-to-dial: guest left a phone AND the viewer may start it. */
  canCall: boolean;
  /** Internal bookings: who booked it, and their note for the BM taking the call. */
  bookedBy?: string | null;
  internalNotes?: string | null;
};

/** One day of the coming week's agenda. */
export type DayGroup = {
  key: string;
  label: string;
  bookings: DashboardBooking[];
};

/** Link chip to one BM's scheduling page (/booking/team/<slug>). */
export type SchedulingPageLink = {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  isSelf: boolean;
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

export function BookingList({ bookings, emptyLabel }: { bookings: DashboardBooking[]; emptyLabel: string }) {
  if (bookings.length === 0) {
    return <p className={styles.emptyNote}>{emptyLabel}</p>;
  }
  return (
    <ul className={styles.bookingList}>
      {bookings.map((booking) => (
        <li key={booking.id} className={styles.bookingRow}>
          <BmAvatar name={booking.bmFirstName} photoUrl={booking.bmPhotoUrl} />
          <span className={styles.bookingTime}>{booking.timeLabel}</span>
          <span className={styles.bookingGuest}>{booking.guestName}</span>
          <span className={styles.bookingMeta}>
            {booking.bmFirstName} · {booking.eventTypeName}
          </span>
          <BrandTag name={booking.brandName} color={booking.brandColor} />
          {booking.routedVia !== "primary" ? <span className={styles.routedBadge}>{booking.routedVia}</span> : null}
          {booking.bookedBy ? (
            <span className={styles.routedBadge} title={booking.internalNotes ? `Note: ${booking.internalNotes}` : undefined}>
              booked by {booking.bookedBy.split("@")[0]}
            </span>
          ) : null}
          {booking.canCall ? <CallButton bookingId={booking.id} /> : null}
          {booking.internalNotes ? <p className={styles.bookingNote}>{booking.internalNotes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export type DashboardFilters = {
  brands: Array<{ key: string; name: string; colorPrimary: string | null }>;
  pods: Array<{ key: string; name: string }>;
  activeBrandKey: string | null;
  activePodKey: string | null;
};

type DashboardProps = {
  issues: CoverageIssueRow[];
  /** Upcoming bookings for the next 7 days, grouped by day ("Today" first). */
  days: DayGroup[];
  recent: RecentBooking[];
  /** One link per active BM to their scheduling page. */
  schedulingPages: SchedulingPageLink[];
  /** The signed-in BM's own guest booking URL; null when they have no active staff row. */
  schedulingLinkUrl: string | null;
  /** Brand/pod scoping; chips are plain links so the filter lives in the URL. */
  filters?: DashboardFilters;
};

function FilterBar({ filters }: { filters: DashboardFilters }) {
  const anyActive = filters.activeBrandKey !== null || filters.activePodKey !== null;
  return (
    <nav className={styles.filterBar} aria-label="Filter bookings by brand or pod">
      <Link href="/booking" className={styles.filterChip} data-active={!anyActive || undefined}>
        All
      </Link>
      {filters.pods.map((pod) => (
        <Link
          key={pod.key}
          href={`/booking?pod=${encodeURIComponent(pod.key)}`}
          className={styles.filterChip}
          data-active={filters.activePodKey === pod.key || undefined}
        >
          {pod.name}
        </Link>
      ))}
      <span className={styles.filterDivider} aria-hidden="true" />
      {filters.brands.map((brand) => (
        <Link
          key={brand.key}
          href={`/booking?brand=${encodeURIComponent(brand.key)}`}
          className={styles.filterChip}
          data-active={filters.activeBrandKey === brand.key || undefined}
          style={brand.colorPrimary ? ({ "--tag": brand.colorPrimary } as React.CSSProperties) : undefined}
        >
          {brand.name}
        </Link>
      ))}
    </nav>
  );
}

export function Dashboard({ issues, days, recent, schedulingPages, schedulingLinkUrl, filters }: DashboardProps) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity !== "error");

  return (
    <div className={styles.dashboard}>
      {filters ? <FilterBar filters={filters} /> : null}
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
          <h2 className={styles.panelTitle}>This week</h2>
          {days.map((day) => (
            <div key={day.key} className={styles.dayGroup}>
              <h3 className={styles.dayHeading}>{day.label}</h3>
              <BookingList
                bookings={day.bookings}
                emptyLabel={day.label === "Today" ? "No confirmed calls today." : "No confirmed calls."}
              />
            </div>
          ))}
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

      <section className={styles.panel} aria-label="Scheduling pages">
        <h2 className={styles.panelTitle}>Scheduling pages</h2>
        <p className={styles.emptyNote}>
          Each Booking Manager&rsquo;s availability, reminders and week calendar live on their own page.
        </p>
        <ul className={styles.bmLinkList}>
          {schedulingPages.map((member) => (
            <li key={member.slug}>
              <Link href={`/booking/team/${encodeURIComponent(member.slug)}`} className={styles.bmLink}>
                {member.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.bmLinkAvatar} src={member.photoUrl} alt="" />
                ) : (
                  <span className={styles.bmLinkAvatar} data-fallback="true" aria-hidden="true">
                    {member.fullName.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                )}
                <span>
                  {member.fullName}
                  {member.isSelf ? " (you)" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
