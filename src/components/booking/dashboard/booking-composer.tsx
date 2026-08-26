"use client";

// Internal booking composer: opens when a time is clicked on the week
// calendar. Search an Airtable guest (name/email), pick the call type, add
// notes for the BM taking the call, book. The server action re-validates the
// slot against fresh free/busy — a click on busy time books nothing and the
// refusal is shown as-is (no silent rescue).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bookInternalAction,
  searchGuestsAction,
} from "@/app/booking/calendar-actions";
import styles from "./booking-composer.module.css";

export type ComposerConfig = {
  staffSlug: string;
  staffName: string;
  videoAllowed: boolean;
  eventTypes: Array<{ key: string; name: string; durationMin: number }>;
};

export type ComposerSlot = { dayKey: string; dayLabel: string; startMin: number };

type GuestHit = { recordId: string; name: string; email: string | null; phone: string | null };

function minuteLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function BookingComposer({
  config,
  slot,
  zone,
  onClose,
}: {
  config: ComposerConfig;
  slot: ComposerSlot;
  zone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typeKey, setTypeKey] = useState(config.eventTypes[0]?.key ?? "");
  const [medium, setMedium] = useState<"video" | "phone">(config.videoAllowed ? "video" : "phone");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GuestHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One key per opened composer: double-clicking Book cannot double-book.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const searchSeq = useRef(0);

  // Debounced guest search against Airtable. All state changes happen in the
  // debounce callback, never synchronously in the effect body.
  const needle = query.trim();
  useEffect(() => {
    const seq = ++searchSeq.current;
    if (needle.length < 2) return;
    const timer = setTimeout(async () => {
      const result = await searchGuestsAction(needle);
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      setSearching(false);
      if (result.ok) {
        setHits(result.hits);
        setSearchError(null);
      } else {
        setHits([]);
        setSearchError(result.error);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [needle]);

  const eventType = config.eventTypes.find((candidate) => candidate.key === typeKey);
  const endMin = slot.startMin + (eventType?.durationMin ?? 30);

  const pickGuest = (hit: GuestHit) => {
    setGuestName(hit.name);
    setGuestEmail(hit.email ?? "");
    setGuestPhone(hit.phone ?? "");
    setHits([]);
    setQuery("");
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await bookInternalAction({
        staffSlug: config.staffSlug,
        dayKey: slot.dayKey,
        startMin: slot.startMin,
        eventTypeKey: typeKey,
        guestName,
        guestEmail,
        guestPhone,
        callMedium: medium,
        notes,
        idempotencyKey,
      });
      if (result.ok) {
        setDone(result.timeLabel);
        router.refresh(); // pull the new booking onto the calendar behind the dialog
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Book a call" onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        {done ? (
          <>
            <h3 className={styles.title}>Booked</h3>
            <p className={styles.confirmation}>
              {guestName} · {done} with {config.staffName}. The guest&rsquo;s confirmation goes to {guestEmail}.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className={styles.title}>
              {slot.dayLabel} · {minuteLabel(slot.startMin)}–{minuteLabel(endMin)}
            </h3>
            <p className={styles.subtitle}>
              {config.staffName} · times in {zone}
            </p>

            <label className={styles.field}>
              Call type
              <select className={styles.input} value={typeKey} onChange={(event) => setTypeKey(event.target.value)}>
                {config.eventTypes.map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {candidate.name} ({candidate.durationMin} min)
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              Guest — search Airtable
              <input
                className={styles.input}
                placeholder="Name or email…"
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  if (next.trim().length < 2) {
                    setHits([]);
                    setSearching(false);
                  } else {
                    setSearching(true);
                  }
                }}
              />
            </label>
            {searching ? <p className={styles.searchNote}>Searching…</p> : null}
            {searchError ? <p className={styles.error}>{searchError}</p> : null}
            {hits.length > 0 ? (
              <ul className={styles.hits}>
                {hits.map((hit) => (
                  <li key={hit.recordId}>
                    <button type="button" className={styles.hit} onClick={() => pickGuest(hit)}>
                      <span className={styles.hitName}>{hit.name}</span>
                      <span className={styles.hitDetail}>
                        {hit.email ?? "no email"}
                        {hit.phone ? ` · ${hit.phone}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={styles.pair}>
              <label className={styles.field}>
                Name
                <input className={styles.input} value={guestName} onChange={(event) => setGuestName(event.target.value)} />
              </label>
              <label className={styles.field}>
                Email
                <input
                  className={styles.input}
                  type="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                />
              </label>
            </div>
            <div className={styles.pair}>
              <label className={styles.field}>
                Phone
                <input className={styles.input} value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} />
              </label>
              <label className={styles.field}>
                Medium
                <select
                  className={styles.input}
                  value={medium}
                  onChange={(event) => setMedium(event.target.value === "phone" ? "phone" : "video")}
                >
                  {config.videoAllowed ? <option value="video">Video (Meet)</option> : null}
                  <option value="phone">Phone — {config.staffName.split(" ")[0]} rings the guest</option>
                </select>
              </label>
            </div>

            <label className={styles.field}>
              Notes for {config.staffName.split(" ")[0]} (not sent to the guest)
              <textarea
                className={styles.textarea}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Context for whoever takes the call…"
              />
            </label>

            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onClose} disabled={pending}>
                Cancel
              </button>
              <button type="button" className={styles.primary} onClick={submit} disabled={pending}>
                {pending ? "Booking…" : "Book the call"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
