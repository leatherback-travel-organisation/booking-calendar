"use client";

// Shortlist composer: pick 2–5 candidate times from the BM's REAL
// availability (server-computed and passed in as props), then mint an
// /invite/<token> URL to paste into an email or text.

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "./copy-button";
import styles from "./team-tools.module.css";

export type InviteActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; url: string };

export type InviteStaffOption = { id: string; fullName: string; isSelf: boolean };
export type InviteEventTypeOption = { id: string; name: string; durationMin: number };
export type InviteSlotOption = { start: string; label: string };

type InvitationComposerProps = {
  staffOptions: InviteStaffOption[];
  selectedStaffId: string;
  eventTypeOptions: InviteEventTypeOption[];
  selectedEventTypeId: string | null;
  zone: string | null;
  /** null when the calendar is not configured/reachable — see slotsNote. */
  slots: InviteSlotOption[] | null;
  slotsNote: string | null;
  action: (state: InviteActionState, formData: FormData) => Promise<InviteActionState>;
};

const MIN_PICKS = 2;
const MAX_PICKS = 5;

export function InvitationComposer({
  staffOptions,
  selectedStaffId,
  eventTypeOptions,
  selectedEventTypeId,
  zone,
  slots,
  slotsNote,
  action,
}: InvitationComposerProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, { status: "idle" } as InviteActionState);
  const [picked, setPicked] = useState<string[]>([]);

  function togglePick(start: string) {
    setPicked((current) => {
      if (current.includes(start)) return current.filter((value) => value !== start);
      if (current.length >= MAX_PICKS) return current;
      return [...current, start];
    });
  }

  if (state.status === "created") {
    return (
      <div className={styles.createdPanel}>
        <h3 className={styles.createdTitle}>Invitation ready</h3>
        <p className={styles.createdUrl}>{state.url}</p>
        <div className={styles.inlineRow}>
          <CopyButton value={state.url} />
        </div>
        <p className={styles.mutedNote}>Paste this into your email or text to the guest.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.formGrid}>
      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Booking Manager
          <select
            className={styles.select}
            name="staffId"
            value={selectedStaffId}
            disabled={staffOptions.length === 1}
            onChange={(event) => {
              setPicked([]);
              router.replace(`/booking/team/invitations?staff=${event.target.value}`);
            }}
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
          <select
            className={styles.select}
            name="eventTypeId"
            value={selectedEventTypeId ?? ""}
            onChange={(event) => {
              setPicked([]);
              router.replace(`/booking/team/invitations?staff=${selectedStaffId}&type=${event.target.value}`);
            }}
          >
            {eventTypeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.durationMin} min)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          Guest name (optional)
          <input className={styles.input} type="text" name="guestName" />
        </label>
        <label className={styles.field}>
          Guest email (optional)
          <input className={styles.input} type="email" name="guestEmail" />
        </label>
      </div>

      <fieldset className={styles.slotFieldset}>
        <legend className={styles.slotLegend}>
          Pick {MIN_PICKS}–{MAX_PICKS} candidate times{zone ? ` (shown in ${zone})` : ""} — {picked.length} selected
        </legend>
        {slots === null || slots.length === 0 ? (
          <p className={styles.mutedNote}>{slotsNote ?? "No open slots available."}</p>
        ) : (
          <div className={styles.slotGrid}>
            {slots.map((slot) => {
              const active = picked.includes(slot.start);
              return (
                <label key={slot.start} className={`${styles.slotToggle} ${active ? styles.slotToggleActive : ""}`}>
                  <input
                    type="checkbox"
                    name="candidate"
                    value={slot.start}
                    checked={active}
                    onChange={() => togglePick(slot.start)}
                  />
                  {slot.label}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {state.status === "error" ? <p className={styles.errorNote}>{state.message}</p> : null}

      <div className={styles.inlineRow}>
        <button type="submit" className={styles.primaryButton} disabled={picked.length < MIN_PICKS}>
          Create invitation
        </button>
        {picked.length < MIN_PICKS ? (
          <span className={styles.mutedNote}>Select at least {MIN_PICKS} times.</span>
        ) : null}
      </div>
    </form>
  );
}
