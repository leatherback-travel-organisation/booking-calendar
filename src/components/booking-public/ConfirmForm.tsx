"use client";

// Confirmation step: guest details + honeypot + optional Turnstile.
// The idempotency key is minted ONCE when the form mounts, so a double-tap
// of "Confirm booking" can never create two bookings.

import { useState } from "react";
import type { FormEvent } from "react";
import styles from "./bp.module.css";
import { Turnstile } from "./Turnstile";
import { formatFullDateTime, guestTimeZone } from "./format";
import { defaultIso, dialCountries, findCountry, OTHER_ISO, toE164 } from "./dial-codes";
import type { BookFailure, BookSuccess, PublicSlot } from "./types";

export type BookMeta = {
  staffSlug: string;
  brandKey: string;
  eventTypeKey: string;
  /** How the guest chose to take the call. */
  callMedium: "video" | "phone";
  sourceKind: "trip" | "bm" | "portal";
  sourceSlug: string | null;
  routedVia: "primary" | "backup" | "pool";
  routedReason: string | null;
  tripName: string | null;
  tripUrl: string | null;
  airtableTripRecordId: string | null;
};

export type BookedResult = {
  bookingId: string | null;
  manageUrl: string | null;
  meetUrl: string | null;
  startIso: string;
  endIso: string;
};

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Extremely old browsers only — RFC4122-shaped fallback.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r % 4) + 8;
    return v.toString(16);
  });
}


// The notes prompt speaks to what THIS call is for, instead of one generic
// "anything you'd like us to know". Keys match booking.event_type; unknown
// keys (new types added later) fall back to the generic wording.
function notesPrompt(eventTypeKey: string, tripName: string | null): { label: string; placeholder: string } {
  switch (eventTypeKey) {
    case "rhime":
      return tripName
        ? {
            label: `Anything you'd like to cover about ${tripName}?`,
            placeholder: "Questions about the itinerary, fitness, timing. nothing is too small.",
          }
        : {
            label: "Which trip are you interested in?",
            placeholder: "e.g. Balkans Rail Explorer, and anything you'd like to cover on the call.",
          };
    case "enquiry":
      return {
        label: "What would you like to talk about?",
        placeholder: "Destinations you're dreaming of, rough dates, travel style…",
      };
    case "lead-up":
      return {
        label: "Anything you'd like covered before your trip?",
        placeholder: "Packing, fitness, itinerary details, dietaries…",
      };
    case "pre-trip":
      return {
        label: "Any last questions before departure?",
        placeholder: "Meeting point, what to bring, final details…",
      };
    case "feedback":
      return {
        label: "Anything in particular you'd like to share about your trip?",
        placeholder: "Highlights, guides, what we could do better…",
      };
    case "chat":
      return {
        label: "What's on your mind?",
        placeholder: "Whatever you'd like to chat about. big or small.",
      };
    default:
      return { label: "Anything you\u2019d like us to know?", placeholder: "" };
  }
}

export function ConfirmForm({
  slot,
  timeZone,
  staffFirstName,
  eventTypeName,
  phone,
  guestCountry,
  meta,
  onBack,
  onSuccess,
  onSlotTaken,
}: {
  slot: PublicSlot;
  timeZone: string;
  staffFirstName: string;
  eventTypeName: string;
  phone: string | null;
  /** Viewer's country from the edge header. presets the dial code, always editable. */
  guestCountry: string | null;
  meta: BookMeta;
  onBack: () => void;
  onSuccess: (result: BookedResult) => void;
  onSlotTaken: (message: string) => void;
}) {
  const [idempotencyKey] = useState(makeIdempotencyKey);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneField, setPhoneField] = useState("");
  const [phoneIso, setPhoneIso] = useState(() => {
    // Where the guest actually is beats what their browser is set to.
    if (guestCountry && findCountry(guestCountry)) return guestCountry;
    return defaultIso(typeof navigator === "undefined" ? undefined : navigator.language);
  });
  const [notes, setNotes] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        staffSlug: meta.staffSlug,
        brandKey: meta.brandKey,
        eventTypeKey: meta.eventTypeKey,
        startIso: slot.start,
        guestName: name.trim(),
        guestEmail: email.trim(),
        guestTimezone: guestTimeZone(),
        sourceKind: meta.sourceKind,
        routedVia: meta.routedVia,
        callMedium: meta.callMedium,
        idempotencyKey,
        website: honeypot,
      };
      if (phoneField.trim()) body.guestPhone = toE164(phoneIso, phoneField.trim());
      if (notes.trim()) body.guestNotes = notes.trim();
      if (meta.sourceSlug) body.sourceSlug = meta.sourceSlug;
      if (meta.routedReason) body.routedReason = meta.routedReason;
      if (meta.tripName) body.tripName = meta.tripName;
      if (meta.tripUrl) body.tripUrl = meta.tripUrl;
      if (meta.airtableTripRecordId) body.airtableTripRecordId = meta.airtableTripRecordId;
      if (turnstileToken) body.turnstileToken = turnstileToken;

      const response = await fetch("/api/booking/public/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const payload = (await response.json()) as BookSuccess;
        onSuccess({
          bookingId: payload.bookingId ?? null,
          manageUrl: payload.manageUrl ?? null,
          meetUrl: payload.meetUrl ?? null,
          startIso: payload.startIso ?? slot.start,
          endIso: payload.endIso ?? slot.end,
        });
        return;
      }

      let failure: BookFailure = { error: "unknown" };
      try {
        failure = (await response.json()) as BookFailure;
      } catch {
        // Non-JSON error body; keep the generic failure.
      }

      if (response.status === 409 || response.status === 422) {
        onSlotTaken(failure.message ?? "That time was just taken. here are fresh options.");
        return;
      }
      if (response.status === 502) {
        setError(
          failure.message ??
            `We couldn't confirm the calendar just now. Please try again${phone ? `, or call us on ${phone}` : ""}.`,
        );
        return;
      }
      if (response.status === 403) {
        setError("We couldn't verify your request. Please complete the check below and try again.");
        return;
      }
      setError(`Something went wrong on our side. Please try again${phone ? `, or call us on ${phone}` : ""}.`);
    } catch {
      setError(`We couldn't reach the booking service. Please check your connection and try again${phone ? `, or call us on ${phone}` : ""}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.slotSummary}>
        {eventTypeName} with {staffFirstName}. {meta.callMedium === "phone" ? "phone call" : "video call"}
        <br />
        <strong>{formatFullDateTime(slot.start, timeZone)}</strong>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="bp-name">Your name</label>
        <input
          id="bp-name"
          className={styles.input}
          type="text"
          required
          autoComplete="name"
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="bp-email">Email</label>
        <input
          id="bp-email"
          className={styles.input}
          type="email"
          required
          autoComplete="email"
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="bp-phone">
          {meta.callMedium === "phone" ? (
            <>Phone — we&rsquo;ll call you on this number</>
          ) : (
            <>Phone <span className={styles.optionalTag}>(optional)</span></>
          )}
        </label>
        <div className={styles.phoneRow}>
          <select
            className={styles.input}
            aria-label="Country code"
            value={phoneIso}
            onChange={(e) => setPhoneIso(e.target.value)}
          >
            {dialCountries().map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.name} +{c.dial}
              </option>
            ))}
            <option value={OTHER_ISO}>Other (type the full number)</option>
          </select>
          <input
            id="bp-phone"
            className={styles.input}
            type="tel"
            required={meta.callMedium === "phone"}
            autoComplete="tel"
            maxLength={50}
            placeholder={phoneIso === OTHER_ISO ? "+971 50 123 4567" : findCountry(phoneIso)?.example}
            value={phoneField}
            onChange={(e) => setPhoneField(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="bp-notes">
          {notesPrompt(meta.eventTypeKey, meta.tripName).label}{" "}
          <span className={styles.optionalTag}>(optional)</span>
        </label>
        <textarea
          id="bp-notes"
          className={styles.textarea}
          maxLength={2000}
          placeholder={notesPrompt(meta.eventTypeKey, meta.tripName).placeholder}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Honeypot: hidden by CSS, not type=hidden. humans never see it. */}
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="bp-website">Website</label>
        <input
          id="bp-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {TURNSTILE_SITE_KEY && <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} />}

      {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</div>}

      <div className={styles.btnRow}>
        <button type="submit" className={styles.primaryBtn} disabled={submitting}>
          {submitting ? "Booking your time…" : "Confirm booking"}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onBack} disabled={submitting}>
          Pick a different time
        </button>
      </div>
    </form>
  );
}
