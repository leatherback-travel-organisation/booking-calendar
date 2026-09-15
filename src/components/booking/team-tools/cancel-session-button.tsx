"use client";

import styles from "./team-tools.module.css";

export function CancelSessionButton({
  sessionId,
  seatsTaken,
  action,
}: {
  sessionId: string;
  seatsTaken: number;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const message =
          seatsTaken > 0
            ? `Cancel this session? ${seatsTaken} booked ${seatsTaken === 1 ? "guest" : "guests"} will be emailed a cancellation.`
            : "Cancel this session?";
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <button type="submit" className={styles.dangerButton}>
        Cancel
      </button>
    </form>
  );
}
