"use client";

// Google-Calendar-style week view for one BM. Every time is precomputed
// server-side as minutes-from-midnight in the scheduling zone; this component
// turns spans into absolutely positioned blocks, pages between weeks via
// plain links, and — when a composer config is supplied — turns a click on a
// day column into an internal booking (see BookingComposer). The column count
// follows the day list rather than assuming a seven-day week.

import { useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import { BmSelect, type BmOption } from "./bm-select";
import { BookingComposer, type ComposerConfig, type ComposerSlot } from "./booking-composer";
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
  | {
      kind: "grid";
      zone: string;
      days: CalendarDay[];
      notice: "unreachable" | "not-connected" | null;
      weekOffset: number;
      weekLabel: string;
    }
  | { kind: "message"; message: string };

export type WeekNav = { prevHref: string; todayHref: string; nextHref: string };

export type CalendarSection = {
  options: BmOption[];
  selectedSlug: string | null;
  view: CalendarView;
  /** Prev/this/next week links (hrefs carry the week offset). Absent = no paging. */
  nav?: WeekNav | null;
  /** Click-to-book config. Absent = read-only calendar. */
  composer?: ComposerConfig | null;
};

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 18 * 60;
const VISIBLE_MIN = DAY_END_MIN - DAY_START_MIN;
const HOUR_LABELS = Array.from({ length: 11 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`);

function pct(minutes: number): string {
  return `${((minutes / VISIBLE_MIN) * 100).toFixed(3)}%`;
}

export function AvailabilityCalendar({ options, selectedSlug, view, nav, composer }: CalendarSection) {
  const [slot, setSlot] = useState<ComposerSlot | null>(null);

  // Click anywhere in a day column → snap to the previous half hour.
  const pickSlot = (event: MouseEvent<HTMLDivElement>, dayKey: string, dayLabel: string) => {
    if (!composer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const minute = DAY_START_MIN + Math.floor((ratio * VISIBLE_MIN) / 30) * 30;
    setSlot({ dayKey, dayLabel, startMin: Math.max(DAY_START_MIN, Math.min(minute, DAY_END_MIN - 30)) });
  };

  return (
    <section className={panelStyles.panel} aria-label="Availability week calendar">
      <div className={styles.head}>
        <h2 className={panelStyles.panelTitle}>Availability</h2>
        {view.kind === "grid" && nav ? (
          <nav className={styles.weekNav} aria-label="Calendar week">
            <Link href={nav.prevHref} className={styles.weekNavButton} aria-label="Previous week">
              ‹
            </Link>
            <Link href={nav.todayHref} className={styles.weekNavLabel} title="Back to this week">
              {view.weekLabel}
            </Link>
            <Link href={nav.nextHref} className={styles.weekNavButton} aria-label="Next week">
              ›
            </Link>
          </nav>
        ) : null}
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
            <div className={styles.grid} style={{ "--day-count": view.days.length } as CSSProperties}>
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
                <div
                  key={day.key}
                  className={styles.dayCol}
                  data-today={day.isToday || undefined}
                  data-bookable={composer ? true : undefined}
                  onClick={(event) => pickSlot(event, day.key, `${day.weekday} ${day.dateLabel}`)}
                >
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
          {composer ? (
            <p className={styles.subtleNote}>Click a time to book a guest in{composer.staffName ? ` with ${composer.staffName}` : ""}.</p>
          ) : null}
        </>
      )}
      {composer && slot ? (
        <BookingComposer config={composer} slot={slot} zone={view.kind === "grid" ? view.zone : ""} onClose={() => setSlot(null)} />
      ) : null}
    </section>
  );
}
