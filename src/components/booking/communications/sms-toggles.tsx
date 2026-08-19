"use client";

// Per-brand SMS reminders, same visual language as the template rows:
// solid brand button = SMS on, dashed = email only. Pod Leads and Senior
// Booking Managers can toggle; everyone else sees the state read-only.

import { useState, useTransition, type CSSProperties } from "react";
import { setBrandSmsReminders } from "@/app/booking/communications/actions";
import styles from "./communications-list.module.css";

export type SmsBrand = {
  key: string;
  name: string;
  colorPrimary: string | null;
  smsRemindersEnabled: boolean;
};

export function SmsToggles({ brands, canEdit }: { brands: SmsBrand[]; canEdit: boolean }) {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(brands.map((brand) => [brand.key, brand.smsRemindersEnabled])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) => {
    if (!canEdit || pending) return;
    const next = !state[key];
    setState((prev) => ({ ...prev, [key]: next }));
    setError(null);
    startTransition(async () => {
      const result = await setBrandSmsReminders({ brandKey: key, enabled: next });
      if (!result.ok) {
        setState((prev) => ({ ...prev, [key]: !next }));
        setError(result.error);
      }
    });
  };

  return (
    <section className={styles.stage}>
      <h2 className={styles.stageTitle}>SMS reminders</h2>
      <ul className={styles.rows}>
        <li className={styles.row}>
          <div className={styles.rowHead}>
            <p className={styles.rowName}>Text message reminders</p>
          </div>
          <p className={styles.rowDescription}>
            When a brand is on, guests who leave a phone number get their 24-hour and 1-hour
            reminders by SMS as well as email. Solid = SMS on, dashed = email only.
            {canEdit ? "" : " Ask a Pod Lead or Senior BM to change these."}
          </p>
          <div className={styles.chips}>
            {brands.map((brand) => (
              <button
                key={brand.key}
                type="button"
                onClick={() => toggle(brand.key)}
                disabled={!canEdit || pending}
                className={styles.brandLink}
                data-tailored={state[brand.key] || undefined}
                style={brand.colorPrimary ? ({ "--tag": brand.colorPrimary } as CSSProperties) : undefined}
                title={
                  canEdit
                    ? `${brand.name}: SMS reminders ${state[brand.key] ? "on — click to turn off" : "off — click to turn on"}`
                    : `${brand.name}: SMS reminders ${state[brand.key] ? "on" : "off"}`
                }
              >
                {brand.name}
              </button>
            ))}
          </div>
          {error ? <p role="alert">{error}</p> : null}
        </li>
      </ul>
    </section>
  );
}
