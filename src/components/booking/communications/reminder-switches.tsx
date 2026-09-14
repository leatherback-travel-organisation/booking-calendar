"use client";

// The two switches on a reminder row — email and text message — for one
// brand and one reminder (Nicola, 15 Sep: "two columns one for SMS one for
// email"). Pod Leads and Senior Booking Managers flip them; everyone else
// sees the state and a note on who to ask.
//
// Turning on the second channel while the first is already on asks first:
// the guest would get the same reminder twice, once by each route, and
// Nicola would rather that be a deliberate choice than an accident.
//
// The setting lives on the brand, not the BM: a guest is dealing with a
// brand, and one BM covering three brands must not be able to silence one.

import { useState, useTransition } from "react";
import { setBrandReminder } from "@/app/booking/communications/actions";
import styles from "./communications-list.module.css";

type Channel = "email" | "sms";

type ReminderSwitchesProps = {
  brandKey: string;
  brandName: string;
  moment: "reminder_24h" | "reminder_1h";
  /** "24-hour reminder", for the accessible names. */
  label: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  canEdit: boolean;
};

export function ReminderSwitches({
  brandKey,
  brandName,
  moment,
  label,
  emailEnabled,
  smsEnabled,
  canEdit,
}: ReminderSwitchesProps) {
  const [on, setOn] = useState<Record<Channel, boolean>>({ email: emailEnabled, sms: smsEnabled });
  const [confirming, setConfirming] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (channel: Channel, next: boolean) => {
    setOn((prev) => ({ ...prev, [channel]: next }));
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      const result = await setBrandReminder({ brandKey, moment, channel, enabled: next });
      if (!result.ok) {
        // The server is the truth: put it back and say why.
        setOn((prev) => ({ ...prev, [channel]: !next }));
        setError(result.error);
      }
    });
  };

  const flip = (channel: Channel) => {
    if (!canEdit || pending) return;
    const next = !on[channel];
    const other: Channel = channel === "email" ? "sms" : "email";
    if (next && on[other]) {
      setConfirming(channel);
      return;
    }
    apply(channel, next);
  };

  const channelName = (channel: Channel) => (channel === "email" ? "email" : "text message");

  return (
    <>
      {(["email", "sms"] as const).map((channel) => (
        <span key={channel} className={styles.switchCell}>
          <button
            type="button"
            role="switch"
            aria-checked={on[channel]}
            aria-label={`${brandName}: ${label} by ${channelName(channel)}`}
            onClick={() => flip(channel)}
            disabled={!canEdit || pending}
            className={styles.switch}
            data-on={on[channel] || undefined}
            title={canEdit ? undefined : "Ask a Pod Lead or Senior BM to change this"}
          >
            <span className={styles.switchKnob} aria-hidden="true" />
          </button>
          <span className={styles.switchState}>{on[channel] ? "On" : "Off"}</span>
        </span>
      ))}
      {confirming && (
        <div className={styles.confirm} role="alertdialog" aria-label="Send this reminder both ways?">
          <p className={styles.confirmText}>
            The {label} is already going out by {channelName(confirming === "email" ? "sms" : "email")}.
            Turning on {channelName(confirming)} as well means every {brandName} guest gets this reminder
            twice, once each way. That can feel like noise.
          </p>
          <span className={styles.confirmActions}>
            <button type="button" className={styles.confirmYes} onClick={() => apply(confirming, true)}>
              Send both ways
            </button>
            <button type="button" className={styles.confirmNo} onClick={() => setConfirming(null)}>
              Leave it
            </button>
          </span>
        </div>
      )}
      {error && (
        <span role="alert" className={styles.switchError}>
          {error}
        </span>
      )}
    </>
  );
}
