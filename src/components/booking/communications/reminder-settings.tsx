"use client";

// Per-brand guest reminder settings, same visual language as the template
// rows: solid brand button = on, dashed = off. Pod Leads and Senior Booking
// Managers can toggle; everyone else sees the state read-only.
//
// These live on the brand, not the BM: a guest is dealing with a brand, and
// one BM covering three brands should not be able to silence one of them.

import { useState, useTransition, type CSSProperties } from "react";
import {
  setBrandReminderEmails,
  setBrandSmsReminders,
} from "@/app/booking/communications/actions";
import styles from "./communications-list.module.css";

export type ReminderBrand = {
  key: string;
  name: string;
  colorPrimary: string | null;
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  smsRemindersEnabled: boolean;
};

type Channel = "reminder_24h" | "reminder_1h" | "sms";

const CHANNELS: Array<{ key: Channel; name: string; description: string }> = [
  {
    key: "reminder_24h",
    name: "24-hour reminder email",
    description:
      "Sent the day before the call. Off means this brand's guests get no 24-hour reminder.",
  },
  {
    key: "reminder_1h",
    name: "1-hour reminder email",
    description:
      "Sent shortly before the call starts. Off means this brand's guests get no 1-hour reminder.",
  },
  {
    key: "sms",
    name: "Text message reminders",
    description:
      "When on, guests who left a phone number get their reminders by SMS as well as email.",
  },
];

type BrandState = Record<Channel, boolean>;

function initialState(brands: ReminderBrand[]): Record<string, BrandState> {
  return Object.fromEntries(
    brands.map((brand) => [
      brand.key,
      {
        reminder_24h: brand.reminder24hEnabled,
        reminder_1h: brand.reminder1hEnabled,
        sms: brand.smsRemindersEnabled,
      },
    ]),
  );
}

export function ReminderSettings({ brands, canEdit }: { brands: ReminderBrand[]; canEdit: boolean }) {
  const [state, setState] = useState<Record<string, BrandState>>(() => initialState(brands));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (channel: Channel, brandKey: string) => {
    if (!canEdit || pending) return;
    const next = !state[brandKey][channel];
    setState((prev) => ({ ...prev, [brandKey]: { ...prev[brandKey], [channel]: next } }));
    setError(null);
    startTransition(async () => {
      const result =
        channel === "sms"
          ? await setBrandSmsReminders({ brandKey, enabled: next })
          : await setBrandReminderEmails({ brandKey, moment: channel, enabled: next });
      if (!result.ok) {
        // Put the chip back where it was — the server is the truth.
        setState((prev) => ({ ...prev, [brandKey]: { ...prev[brandKey], [channel]: !next } }));
        setError(result.error);
      }
    });
  };

  return (
    <section className={styles.stage}>
      <h2 className={styles.stageTitle}>Guest reminders</h2>
      <p className={styles.rowDescription}>
        Set per brand. Confirmations, reschedules and cancellations always send — these
        control reminders only.
        {canEdit ? "" : " Ask a Pod Lead or Senior BM to change these."}
      </p>
      <ul className={styles.rows}>
        {CHANNELS.map((channel) => (
          <li key={channel.key} className={styles.row}>
            <div className={styles.rowHead}>
              <p className={styles.rowName}>{channel.name}</p>
            </div>
            <p className={styles.rowDescription}>
              {channel.description} Solid = on, dashed = off.
            </p>
            <div className={styles.chips}>
              {brands.map((brand) => (
                <button
                  key={brand.key}
                  type="button"
                  onClick={() => toggle(channel.key, brand.key)}
                  disabled={!canEdit || pending}
                  className={styles.brandLink}
                  data-tailored={state[brand.key][channel.key] || undefined}
                  style={brand.colorPrimary ? ({ "--tag": brand.colorPrimary } as CSSProperties) : undefined}
                  title={
                    canEdit
                      ? `${brand.name}: ${channel.name} ${state[brand.key][channel.key] ? "on — click to turn off" : "off — click to turn on"}`
                      : `${brand.name}: ${channel.name} ${state[brand.key][channel.key] ? "on" : "off"}`
                  }
                >
                  {brand.name}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
