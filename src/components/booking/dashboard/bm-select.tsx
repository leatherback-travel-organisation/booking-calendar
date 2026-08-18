"use client";

// Navigation-only dropdown: picking a Booking Manager reloads /booking with
// that BM's week calendar rendered server-side.

import { useRouter } from "next/navigation";
import styles from "./dashboard-calendar.module.css";

export type BmOption = { slug: string; fullName: string };

export function BmSelect({ options, selectedSlug }: { options: BmOption[]; selectedSlug: string | null }) {
  const router = useRouter();
  return (
    <select
      className={styles.bmSelect}
      aria-label="Booking Manager"
      value={selectedSlug ?? ""}
      onChange={(event) => router.push(`/booking?bm=${encodeURIComponent(event.target.value)}`)}
    >
      {options.map((option) => (
        <option key={option.slug} value={option.slug}>
          {option.fullName}
        </option>
      ))}
    </select>
  );
}
