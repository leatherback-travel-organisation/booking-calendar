// Presentational dashboard for /booking. All data is computed server-side in
// the page; this component just lays it out, Cove-quiet.

import Link from "next/link";
import type { CoverageIssueRow } from "@/lib/booking/reference/queries";
import { formatRelative } from "./relative";
import styles from "./dashboard.module.css";

export type DashboardBooking = {
  id: string;
  timeLabel: string;
  guestName: string;
  bmFirstName: string;
  eventTypeName: string;
  brandName: string;
  routedVia: string;
};

export type RecentBooking = {
  id: string;
  createdAtIso: string;
  guestName: string;
  bmFirstName: string;
  eventTypeName: string;
  brandName: string;
  sourceKind: string;
  status: string;
};

export type HeatDay = {
  key: string;
  letter: string;
  label: string;
  count: number;
};

export type HeatRow = {
  staffId: string;
  name: string;
  days: HeatDay[] | null;
  note: string | null;
};

export type HeatStrip =
  | { kind: "ready"; header: HeatDay[]; rows: HeatRow[] }
  | { kind: "placeholder"; message: string };

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

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
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
  heat: HeatStrip;
};

export function Dashboard({ issues, today, week, recent, heat }: DashboardProps) {
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
          New group session
        </Link>
        <Link href="/booking/team/invitations" className={styles.secondaryAction}>
          Propose times
        </Link>
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

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Availability — next 14 days</h2>
        {heat.kind === "placeholder" ? (
          <p className={styles.emptyNote}>{heat.message}</p>
        ) : (
          <div className={styles.heatScroll}>
            <table className={styles.heatTable}>
              <thead>
                <tr>
                  <th className={styles.heatName} aria-label="Booking manager" />
                  {heat.header.map((day) => (
                    <th key={day.key} className={styles.heatHeader} title={day.label}>
                      {day.letter}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.rows.map((row) => (
                  <tr key={row.staffId}>
                    <th className={styles.heatName} scope="row">
                      {row.name}
                    </th>
                    {row.days ? (
                      row.days.map((day) => (
                        <td key={day.key} className={styles.heatCell}>
                          <span
                            className={styles.heatSquare}
                            data-level={heatLevel(day.count)}
                            title={`${day.label}: ${day.count} open ${day.count === 1 ? "slot" : "slots"}`}
                          />
                        </td>
                      ))
                    ) : (
                      <td className={styles.heatNote} colSpan={heat.header.length}>
                        {row.note}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
