"use client";

// Navigation-only dropdown: picking a Booking Manager opens their page, week
// calendar included. Rendered only for Pod Leads — BMs cannot view others.

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
      onChange={(event) => router.push(`/booking/team/${encodeURIComponent(event.target.value)}`)}
    >
      {options.map((option) => (
        <option key={option.slug} value={option.slug}>
          {option.fullName}
        </option>
      ))}
    </select>
  );
}
