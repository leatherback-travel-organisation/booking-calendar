// Read-only Google-Calendar-style week view for one BM. Every time is
// precomputed server-side as minutes-from-midnight in the scheduling zone;
// this component only turns spans into absolutely positioned blocks.

import { BmSelect, type BmOption } from "./bm-select";
import panelStyles from "./dashboard.module.css";
import styles from "./dashboard-calendar.module.css";

export type CalendarBlock = {
  key: string;
  kind: "booked" | "open" | "busy";
  /** Minutes from midnight in the scheduling zone, clipped to 08:00–18:00. */
  startMin: number;
  endMin: number;
  /** Booked blocks only: start time ("9:00 AM"), guest name, event type. */
  timeLabel: string | null;
  title: string | null;
  subtitle: string | null;
  tooltip: string;
};

export type CalendarDay = {
  key: string;
  weekday: string;
  dateLabel: string;
  isToday: boolean;
  blocks: CalendarBlock[];
};

export type CalendarView =
  | { kind: "grid"; zone: string; days: CalendarDay[]; notice: "unreachable" | "not-connected" | null }
  | { kind: "message"; message: string };

export type CalendarSection = {
  options: BmOption[];
  selectedSlug: string | null;
  view: CalendarView;
};

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 18 * 60;
const VISIBLE_MIN = DAY_END_MIN - DAY_START_MIN;
const HOUR_LABELS = Array.from({ length: 11 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`);

function pct(minutes: number): string {
  return `${((minutes / VISIBLE_MIN) * 100).toFixed(3)}%`;
}

export function AvailabilityCalendar({ options, selectedSlug, view }: CalendarSection) {
  return (
    <section className={panelStyles.panel} aria-label="Availability week calendar">
      <div className={styles.head}>
        <h2 className={panelStyles.panelTitle}>Availability</h2>
        {options.length > 0 ? <BmSelect options={options} selectedSlug={selectedSlug} /> : null}
      </div>

      {view.kind === "message" ? (
        <p className={panelStyles.emptyNote}>{view.message}</p>
      ) : (
        <>
          {view.notice === "unreachable" ? (
            <p className={styles.warningNote}>Google Calendar unreachable — showing working hours and app bookings only</p>
          ) : null}
          {view.notice === "not-connected" ? (
            <p className={styles.subtleNote}>Calendar not connected — Busy time from Google will appear here once connected.</p>
          ) : null}
          <p className={styles.zoneNote}>Times in {view.zone}</p>

          <div className={styles.scroll}>
            <div className={styles.grid}>
              <div className={styles.corner} aria-hidden="true" />
              {view.days.map((day) => (
                <div key={day.key} className={styles.dayHead} data-today={day.isToday || undefined}>
                  <span className={styles.dayName}>{day.weekday}</span>
                  <span className={styles.dayDate}>{day.dateLabel}</span>
                </div>
              ))}

              <div className={styles.gutter} aria-hidden="true">
                {HOUR_LABELS.map((label, index) => (
                  <span key={label} className={styles.hourLabel} style={{ top: pct(index * 60) }}>
                    {label}
                  </span>
                ))}
              </div>
              {view.days.map((day) => (
                <div key={day.key} className={styles.dayCol} data-today={day.isToday || undefined}>
                  {day.blocks.map((block) => (
                    <div
                      key={block.key}
                      className={styles.block}
                      data-kind={block.kind}
                      style={{
                        top: pct(block.startMin - DAY_START_MIN),
                        height: pct(block.endMin - block.startMin),
                      }}
                      title={block.tooltip}
                    >
                      {block.kind === "booked" ? (
                        <>
                          <span className={styles.blockTime}>{block.timeLabel}</span>{" "}
                          <span className={styles.blockTitle}>{block.title}</span>{" "}
                          <span className={styles.blockSub}>{block.subtitle}</span>
                        </>
                      ) : (
                        <span className={styles.blockLabel}>{block.kind === "open" ? "Open" : "Busy"}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
