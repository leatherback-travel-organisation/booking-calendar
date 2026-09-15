"use client";

// Click-to-dial: rings the BM's Aircall app, then connects the guest. Only
// rendered for the booking's own BM (or a Pod Lead) when the guest left a
// phone number.

import { useState, useTransition } from "react";
import { startCallAction } from "@/app/booking/call-actions";
import styles from "./call-button.module.css";

export function CallButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startCallAction(bookingId);
            setNote(result.message);
          })
        }
      >
        {pending ? "Calling…" : "Call"}
      </button>
      {note ? <span className={styles.note}>{note}</span> : null}
    </span>
  );
}
