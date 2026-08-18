"use client";

// All slots are fetched once; this component only pages through them locally,
// one week at a time, grouped by day in the guest's timezone.

import { useMemo, useState } from "react";
import styles from "./bp.module.css";
import {
  firstPageWithSlot,
  formatDayHeading,
  formatDayShort,
  formatTime,
  groupSlotsByDay,
  weekDayKeys,
  zoneAbbr,
} from "./format";
import type { PublicSlot } from "./types";

export function SlotPicker({
  slots,
  timeZone,
  onPick,
}: {
  slots: PublicSlot[];
  timeZone: string;
  onPick: (slot: PublicSlot) => void;
}) {
  // Open on the first week that actually contains a slot (in the guest's
  // zone) instead of a possibly-empty current week; prev/next still walk
  // week by week from today.
  const [page, setPage] = useState(() => firstPageWithSlot(slots, timeZone));

  // When a new set of slots loads (event type or BM changed), land on that
  // set's first available week again.
  const [seenSlots, setSeenSlots] = useState(slots);
  if (slots !== seenSlots) {
    setSeenSlots(slots);
    setPage(firstPageWithSlot(slots, timeZone));
  }

  const groups = useMemo(() => groupSlotsByDay(slots, timeZone), [slots, timeZone]);
  const window = useMemo(() => weekDayKeys(page, timeZone), [page, timeZone]);
  const windowSet = useMemo(() => new Set(window), [window]);

  const visible = groups.filter((g) => windowSet.has(g.key));
  const lastWindowKey = window[window.length - 1];
  const hasNext = groups.some((g) => g.key > lastWindowKey);
  const hasPrev = page > 0;
  const abbr = slots.length > 0 ? zoneAbbr(slots[0].start, timeZone) : zoneAbbr(new Date().toISOString(), timeZone);

  return (
    <div className={styles.dayGroup} role="region" aria-label="Available times">
      <p className={styles.tzLine}>
        Times shown in {timeZone.replace(/_/g, " ")}{abbr ? ` (${abbr})` : ""}
      </p>
      <div className={styles.weekNav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={!hasPrev}
          aria-label="Previous week"
        >
          &larr; Earlier
        </button>
        <span className={styles.weekRange}>
          {formatDayShort(`${window[0]}T12:00:00Z`, "UTC")} – {formatDayShort(`${lastWindowKey}T12:00:00Z`, "UTC")}
        </span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasNext}
          aria-label="Next week"
        >
          Later &rarr;
        </button>
      </div>
      {visible.length === 0 ? (
        <p className={styles.emptyWeek}>
          No times this week{hasNext ? " — try the following week." : "."}
        </p>
      ) : (
        visible.map((group) => (
          <div key={group.key} className={styles.dayGroup}>
            <h3 className={styles.dayHeading}>{formatDayHeading(group.slots[0].start, timeZone)}</h3>
            <div className={styles.slotGrid}>
              {group.slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  data-testid="slot"
                  className={styles.slotBtn}
                  onClick={() => onPick(slot)}
                >
                  {formatTime(slot.start, timeZone)}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
