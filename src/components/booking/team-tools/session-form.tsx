"use client";

// Create a group session. Event-type options follow the chosen BM's primary
// brand; the datetime is interpreted server-side in that brand's scheduling
// zone (stated in the label).

import { useMemo, useState } from "react";
import styles from "./team-tools.module.css";

export type SessionStaffOption = {
  id: string;
  fullName: string;
  primaryBrandId: string | null;
  isSelf: boolean;
};

export type SessionEventTypeOption = {
  id: string;
  brandId: string;
  name: string;
  durationMin: number;
};

type SessionFormProps = {
  staffOptions: SessionStaffOption[];
  eventTypes: SessionEventTypeOption[];
  zoneByStaffId: Record<string, string>;
  /** Preselect this BM (must be one of staffOptions); null = first option. */
  defaultStaffId?: string | null;
  action: (formData: FormData) => Promise<void>;
};

export function SessionForm({ staffOptions, eventTypes, zoneByStaffId, defaultStaffId, action }: SessionFormProps) {
  const [staffId, setStaffId] = useState(
    () => staffOptions.find((option) => option.id === defaultStaffId)?.id ?? staffOptions[0]?.id ?? "",
  );
  const selectedStaff = staffOptions.find((option) => option.id === staffId) ?? null;

  const typeOptions = useMemo(
    () => eventTypes.filter((eventType) => eventType.brandId === selectedStaff?.primaryBrandId),
    [eventTypes, selectedStaff],
  );

  const zone = selectedStaff ? (zoneByStaffId[selectedStaff.id] ?? "the brand scheduling zone") : null;

  return (
    <form action={action} className={styles.formGrid}>
      <label className={styles.field}>
        Booking Manager
        <select
          className={styles.select}
          name="staffId"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
          disabled={staffOptions.length === 1}
        >
          {staffOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.fullName}
              {option.isSelf ? " (you)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        Event type
        <select className={styles.select} name="eventTypeId" defaultValue="" key={staffId} required>
          <option value="" disabled>
            {typeOptions.length === 0 ? "No group-capable event types" : "Choose…"}
          </option>
          {typeOptions.map((eventType) => (
            <option key={eventType.id} value={eventType.id}>
              {eventType.name} ({eventType.durationMin} min)
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        Starts at{zone ? ` — in ${zone}` : ""}
        <input className={styles.input} type="datetime-local" name="start" required />
      </label>

      <label className={styles.field}>
        Capacity (2–50 seats)
        <input className={styles.input} type="number" name="capacity" min={2} max={50} defaultValue={10} required />
      </label>

      <div>
        <button type="submit" className={styles.primaryButton} disabled={typeOptions.length === 0}>
          Create session
        </button>
      </div>
    </form>
  );
}
