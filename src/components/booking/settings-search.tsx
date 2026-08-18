"use client";

// ⌘K settings search: a small static registry of every booking admin surface.
// Mounted per-page (BookingShell is owned elsewhere) — the listener is cheap
// and the modal renders nothing until opened.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings-search.module.css";

type RegistryEntry = {
  label: string;
  keywords: string[];
  href: string;
  section: string;
};

const REGISTRY: RegistryEntry[] = [
  { label: "Dashboard", keywords: ["home", "overview", "today"], href: "/booking", section: "Booking" },
  { label: "Availability heat strip", keywords: ["heat", "open slots", "capacity"], href: "/booking", section: "Booking" },
  { label: "Recent bookings", keywords: ["recent", "self-booked", "source"], href: "/booking", section: "Booking" },
  { label: "My availability & scheduling", keywords: ["schedule", "hours", "slots", "my page"], href: "/booking/availability", section: "Availability" },
  { label: "Working hours", keywords: ["hours", "days", "week", "shift"], href: "/booking/availability", section: "Availability" },
  { label: "Buffer between calls", keywords: ["buffer", "gap", "break"], href: "/booking/availability", section: "Availability" },
  { label: "Minimum notice", keywords: ["notice", "lead time", "same day"], href: "/booking/availability", section: "Availability" },
  { label: "Booking window", keywords: ["window", "how far ahead", "days"], href: "/booking/availability", section: "Availability" },
  { label: "Timezone override", keywords: ["timezone", "zone", "iana", "remote"], href: "/booking/availability", section: "Availability" },
  { label: "BM bio", keywords: ["bio", "profile", "about"], href: "/booking/availability", section: "Availability" },
  { label: "Coverage map", keywords: ["coverage", "routing", "gaps", "trips"], href: "/booking/routing", section: "Routing" },
  { label: "Coverage issues", keywords: ["issues", "errors", "warnings"], href: "/booking/routing", section: "Routing" },
  { label: "Guest communications", keywords: ["email", "templates", "messages"], href: "/booking/communications", section: "Communications" },
  { label: "Confirmation email", keywords: ["confirmation", "template", "email"], href: "/booking/communications/confirmation", section: "Communications" },
  { label: "24 hour reminder", keywords: ["reminder", "24h", "day before"], href: "/booking/communications", section: "Communications" },
  { label: "Team roster", keywords: ["team", "staff", "bm", "people"], href: "/booking/team", section: "Team" },
  { label: "Group sessions", keywords: ["group", "sessions", "seats", "webinar"], href: "/booking/team/sessions", section: "Team" },
  { label: "New group session", keywords: ["create", "group", "session"], href: "/booking/team/sessions", section: "Team" },
  { label: "Invitations (propose times)", keywords: ["invite", "shortlist", "propose", "times"], href: "/booking/team/invitations", section: "Team" },
  { label: "Integrations health", keywords: ["integrations", "broken", "status", "health"], href: "/booking/integrations", section: "Integrations" },
  { label: "Google Calendar connection", keywords: ["google", "calendar", "delegation"], href: "/booking/integrations", section: "Integrations" },
  { label: "Airtable & Notion sync", keywords: ["airtable", "notion", "sync", "reference"], href: "/booking/integrations", section: "Integrations" },
  { label: "Reminders cron", keywords: ["cron", "heartbeat", "reminders"], href: "/booking/integrations", section: "Integrations" },
];

export function SettingsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
        setIndex(0);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGISTRY;
    return REGISTRY.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.section.toLowerCase().includes(q) ||
        entry.keywords.some((keyword) => keyword.includes(q)),
    );
  }, [query]);

  const go = useCallback(
    (entry: RegistryEntry | undefined) => {
      if (!entry) return;
      setOpen(false);
      router.push(entry.href);
    },
    [router],
  );

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => { setOpen(true); setQuery(""); setIndex(0); }}>
        Search settings <kbd>⌘K</kbd>
      </button>
      {open ? (
        <div className={styles.overlay} onClick={() => setOpen(false)} role="presentation">
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Settings search" onClick={(event) => event.stopPropagation()}>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder="Jump to a setting or page…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setIndex((current) => Math.min(current + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setIndex((current) => Math.max(current - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(matches[index]);
                }
              }}
            />
            <ul className={styles.results}>
              {matches.length === 0 ? (
                <li className={styles.emptyRow}>No settings match “{query}”.</li>
              ) : (
                matches.map((entry, entryIndex) => (
                  <li key={`${entry.href}-${entry.label}`}>
                    <button
                      type="button"
                      className={`${styles.result} ${entryIndex === index ? styles.resultActive : ""}`}
                      onMouseEnter={() => setIndex(entryIndex)}
                      onClick={() => go(entry)}
                    >
                      <span className={styles.resultLabel}>{entry.label}</span>
                      <span className={styles.resultSection}>{entry.section}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className={styles.hint}>↑↓ to navigate · ↵ to open · esc to close</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
