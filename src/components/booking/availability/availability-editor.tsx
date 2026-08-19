"use client";

// Per-BM scheduling controls, shown on each BM's own page. The permission
// split mirrors the server rules (which are authoritative): Pod Leads edit
// everything for everyone; a Booking Manager edits only their own buffer,
// bio and reminder toggles.

import { useState } from "react";
import styles from "./availability.module.css";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BUFFER_CHOICES = [0, 5, 10, 15, 30];
const COMMON_ZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Pacific/Auckland",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
];

function minutesLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

const START_OPTIONS: number[] = [];
for (let m = 0; m < 1440; m += 30) START_OPTIONS.push(m);
const END_OPTIONS: number[] = [];
for (let m = 30; m <= 1440; m += 30) END_OPTIONS.push(m);

export type SelectedStaffSettings = {
  id: string;
  fullName: string;
  email: string;
  bufferMinutes: number;
  minNoticeHours: number;
  bookingWindowDays: number;
  timezoneOverride: string | null;
  bio: string | null;
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
};

export type HoursRow = { dayOfWeek: number; startMin: number; endMin: number };

type DayState = { on: boolean; startMin: number; endMin: number };

type AvailabilityEditorProps = {
  selected: SelectedStaffSettings;
  hours: HoursRow[];
  zoneLabel: string;
  canManage: boolean;
  isSelf: boolean;
  savedFlag: string | null;
  saveWorkingHoursAction: (formData: FormData) => Promise<void>;
  saveSettingsAction: (formData: FormData) => Promise<void>;
};

export function AvailabilityEditor({
  selected,
  hours,
  zoneLabel,
  canManage,
  isSelf,
  savedFlag,
  saveWorkingHoursAction,
  saveSettingsAction,
}: AvailabilityEditorProps) {
  const canEditHours = canManage;
  const canEditOwnBits = canManage || isSelf;

  const [days, setDays] = useState<DayState[]>(() => {
    const initial: DayState[] = Array.from({ length: 7 }, () => ({ on: false, startMin: 540, endMin: 1020 }));
    for (const row of hours) {
      initial[row.dayOfWeek] = { on: true, startMin: row.startMin, endMin: row.endMin };
    }
    return initial;
  });
  const [timezone, setTimezone] = useState(selected.timezoneOverride ?? "");

  function patchDay(day: number, patch: Partial<DayState>) {
    setDays((current) => current.map((state, index) => (index === day ? { ...state, ...patch } : state)));
  }

  return (
    <div className={styles.editor}>
      {savedFlag ? <p className={styles.savedNote}>Saved.</p> : null}

      <form action={saveWorkingHoursAction} className={styles.card}>
        <input type="hidden" name="staffId" value={selected.id} />
        <h2 className={styles.cardTitle}>Working hours</h2>
        <p className={styles.cardHint}>Times are in {zoneLabel}.</p>
        {!canEditHours ? <p className={styles.lockedNote}>Working hours are managed by your Pod Lead.</p> : null}
        <div className={styles.hoursGrid}>
          {DAY_ORDER.map((day) => {
            const state = days[day];
            return (
              <div key={day} className={styles.hoursRow} data-off={state.on ? undefined : "true"}>
                <label className={styles.dayToggle}>
                  <input
                    type="checkbox"
                    name={`d${day}on`}
                    checked={state.on}
                    disabled={!canEditHours}
                    onChange={(event) => patchDay(day, { on: event.target.checked })}
                  />
                  {DAY_LABELS[day]}
                </label>
                <select
                  className={styles.timeSelect}
                  name={`d${day}start`}
                  value={state.startMin}
                  disabled={!canEditHours || !state.on}
                  onChange={(event) => patchDay(day, { startMin: Number(event.target.value) })}
                  aria-label={`${DAY_LABELS[day]} start`}
                >
                  {START_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutesLabel(minutes)}
                    </option>
                  ))}
                </select>
                <span className={styles.timeDash}>–</span>
                <select
                  className={styles.timeSelect}
                  name={`d${day}end`}
                  value={state.endMin}
                  disabled={!canEditHours || !state.on}
                  onChange={(event) => patchDay(day, { endMin: Number(event.target.value) })}
                  aria-label={`${DAY_LABELS[day]} end`}
                >
                  {END_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutesLabel(minutes)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        {canEditHours ? (
          <div className={styles.actions}>
            <button type="submit" className={styles.saveButton}>
              Save working hours
            </button>
          </div>
        ) : null}
      </form>

      <form action={saveSettingsAction} className={styles.card}>
        <input type="hidden" name="staffId" value={selected.id} />
        <h2 className={styles.cardTitle}>Scheduling settings</h2>
        {!canManage && !isSelf ? (
          <p className={styles.lockedNote}>You can only edit your own settings.</p>
        ) : null}

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            Buffer between calls
            <select className={styles.select} name="bufferMinutes" defaultValue={selected.bufferMinutes} disabled={!canEditOwnBits}>
              {BUFFER_CHOICES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            Minimum notice (hours)
            <input
              className={styles.input}
              type="number"
              name="minNoticeHours"
              min={0}
              max={72}
              defaultValue={selected.minNoticeHours}
              disabled={!canManage}
            />
          </label>

          <label className={styles.field}>
            Booking window (days)
            <input
              className={styles.input}
              type="number"
              name="bookingWindowDays"
              min={7}
              max={90}
              defaultValue={selected.bookingWindowDays}
              disabled={!canManage}
            />
          </label>

          <label className={styles.field}>
            Timezone override
            <input
              className={styles.input}
              type="text"
              name="timezoneOverride"
              list="availability-zones"
              placeholder="Empty = brand zone"
              value={timezone}
              disabled={!canManage}
              onChange={(event) => setTimezone(event.target.value)}
            />
            <datalist id="availability-zones">
              {COMMON_ZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </label>
        </div>

        {timezone.trim().length > 0 ? (
          <p className={styles.zoneWarning}>
            Override set — guest-facing hours anchor to the brand&rsquo;s market, so shifted working hours may surprise
            guests browsing in the brand&rsquo;s zone (§5.1a).
          </p>
        ) : null}

        {/* Marker so the server action can tell "unchecked" from "not submitted". */}
        <input type="hidden" name="remindersEnabledField" value="1" />
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            name="reminder24hEnabled"
            defaultChecked={selected.reminder24hEnabled}
            disabled={!canEditOwnBits}
          />
          Send the 24-hour reminder email
        </label>
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            name="reminder1hEnabled"
            defaultChecked={selected.reminder1hEnabled}
            disabled={!canEditOwnBits}
          />
          Send the 1-hour reminder email
        </label>
        <label className={styles.field}>
          Bio
          <textarea
            className={styles.textarea}
            name="bio"
            rows={3}
            defaultValue={selected.bio ?? ""}
            disabled={!canEditOwnBits}
            placeholder="A sentence guests see on the booking page."
          />
        </label>

        {canEditOwnBits ? (
          <div className={styles.actions}>
            <button type="submit" className={styles.saveButton}>
              Save settings
            </button>
            {!canManage ? <span className={styles.cardHint}>You can change your buffer, bio and reminder emails.</span> : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
