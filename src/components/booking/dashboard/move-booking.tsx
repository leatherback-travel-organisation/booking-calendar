"use client";

// Move a call to another Booking Manager (Nicola, 17 Sep). A Pod Lead picks
// anyone; the floating BM sees one button, "Take this call". The guest is
// emailed, the calendar event and Help Scout conversation follow.

import { useState, useTransition } from "react";
import { moveBookingAction } from "@/app/booking/move-actions";
import styles from "./move-booking.module.css";

export type MoveTarget = { id: string; firstName: string; fullName: string };

export function MoveBooking({
  bookingId,
  targets,
  mode,
}: {
  bookingId: string;
  targets: MoveTarget[];
  /** "lead": choose anyone. "floating": the one target is the viewer. */
  mode: "lead" | "floating";
}) {
  const [choice, setChoice] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (targets.length === 0) return null;

  const move = (toStaffId: string) =>
    startTransition(async () => {
      const result = await moveBookingAction(bookingId, toStaffId);
      setNote({ ok: result.ok, text: result.message });
      if (result.ok) setChoice("");
    });

  if (mode === "floating") {
    const me = targets[0];
    return (
      <span className={styles.wrap}>
        <button type="button" className={styles.button} disabled={pending} onClick={() => move(me.id)}>
          {pending ? "Moving…" : "Take this call"}
        </button>
        {note ? <span className={styles.note} data-ok={note.ok || undefined}>{note.text}</span> : null}
      </span>
    );
  }

  return (
    <span className={styles.wrap}>
      <select
        className={styles.select}
        aria-label="Move this call to"
        value={choice}
        disabled={pending}
        onChange={(event) => setChoice(event.target.value)}
      >
        <option value="">Move to…</option>
        {targets.map((target) => (
          <option key={target.id} value={target.id}>
            {target.fullName}
          </option>
        ))}
      </select>
      {choice ? (
        <button type="button" className={styles.button} disabled={pending} onClick={() => move(choice)}>
          {pending ? "Moving…" : "Move"}
        </button>
      ) : null}
      {note ? <span className={styles.note} data-ok={note.ok || undefined}>{note.text}</span> : null}
    </span>
  );
}
