"use client";

// One on/off switch for a brand-level guest-reminder setting, sitting on the
// row it governs (Nicola, 15 Sep: "a toggle for pod leads to switch on / off
// reminder emails here too"). Pod Leads and Senior Booking Managers flip it;
// everyone else sees the state and a note on who to ask.
//
// The setting lives on the brand, not the BM: a guest is dealing with a
// brand, and one BM covering three brands must not be able to silence one.

import { useState, useTransition } from "react";
import {
  setBrandReminderEmails,
  setBrandSmsReminders,
} from "@/app/booking/communications/actions";
import styles from "./communications-list.module.css";

export type SwitchKind = "reminder_24h" | "reminder_1h" | "sms";

type BrandSwitchProps = {
  brandKey: string;
  brandName: string;
  kind: SwitchKind;
  /** What the switch governs, for the accessible name: "24-hour reminder". */
  label: string;
  enabled: boolean;
  canEdit: boolean;
};

export function BrandSwitch({ brandKey, brandName, kind, label, enabled, canEdit }: BrandSwitchProps) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flip = () => {
    if (!canEdit || pending) return;
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      const result =
        kind === "sms"
          ? await setBrandSmsReminders({ brandKey, enabled: next })
          : await setBrandReminderEmails({ brandKey, moment: kind, enabled: next });
      if (!result.ok) {
        // The server is the truth: put it back and say why.
        setOn(!next);
        setError(result.error);
      }
    });
  };

  return (
    <span className={styles.switchWrap}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${brandName}: ${label}`}
        onClick={flip}
        disabled={!canEdit || pending}
        className={styles.switch}
        data-on={on || undefined}
        title={canEdit ? undefined : "Ask a Pod Lead or Senior BM to change this"}
      >
        <span className={styles.switchKnob} aria-hidden="true" />
      </button>
      <span className={styles.switchState}>{on ? "On" : "Off"}</span>
      {error && (
        <span role="alert" className={styles.switchError}>
          {error}
        </span>
      )}
    </span>
  );
}
