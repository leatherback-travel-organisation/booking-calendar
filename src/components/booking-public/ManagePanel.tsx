"use client";

// Guest self-service panel for /manage/[token]: view, cancel, or reschedule.
// Reschedule keeps the SAME BM — the picker only ever shows their calendar.

import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./bp.module.css";
import { BrandFrame, type FrameBrand } from "./BrandFrame";
import { SlotPicker } from "./SlotPicker";
import { formatFullDateTime, guestTimeZone } from "./format";
import { cancelBookingAction, rescheduleBookingAction } from "@/app/manage/[token]/actions";
import type { AvailabilityPayload, PublicSlot } from "./types";

export type ManagePanelProps = {
  token: string;
  state: "manageable" | "past" | "cancelled";
  booking: {
    startsAt: string;
    endsAt: string;
    guestName: string;
    guestTimezone: string | null;
    meetUrl: string | null;
  };
  staff: { slug: string; firstName: string; photoUrl: string | null };
  brand: FrameBrand & { key: string };
  eventType: { key: string; name: string; durationMin: number };
};

type Mode = "summary" | "confirm-cancel" | "reschedule" | "cancelled";
type AvailResult = { key: string; data: AvailabilityPayload | null; failed: boolean };

const emptySubscribe = () => () => {};

export function ManagePanel({ token, state, booking, staff, brand, eventType }: ManagePanelProps) {
  // SSR/hydration render in the stored guest timezone; the browser's real
  // zone takes over right after hydration without a mismatch warning.
  const tz = useSyncExternalStore(emptySubscribe, guestTimeZone, () => booking.guestTimezone ?? "UTC");
  const [mode, setMode] = useState<Mode>(state === "cancelled" ? "cancelled" : "summary");
  const [startsAt, setStartsAt] = useState(booking.startsAt);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availResult, setAvailResult] = useState<AvailResult | null>(null);
  const [availNonce, setAvailNonce] = useState(0);
  const [pendingSlot, setPendingSlot] = useState<PublicSlot | null>(null);

  // Availability loads lazily, only when the guest opens the reschedule
  // picker. Loading state is derived from the key so the effect never calls
  // setState synchronously.
  const availKey = mode === "reschedule" ? `${staff.slug}|${brand.key}|${eventType.key}|${availNonce}` : null;
  useEffect(() => {
    if (!availKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ staff: staff.slug, brand: brand.key, type: eventType.key });
    fetch(`/api/booking/public/availability?${params}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("availability failed");
        return response.json() as Promise<AvailabilityPayload>;
      })
      .then((data) => setAvailResult({ key: availKey, data, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setAvailResult({ key: availKey, data: null, failed: true });
      });
    return () => controller.abort();
  }, [availKey, staff.slug, brand.key, eventType.key]);

  const availLoading = availKey !== null && availResult?.key !== availKey;
  const availFailed = availKey !== null && availResult?.key === availKey && availResult.failed;
  const availData =
    availKey !== null && availResult?.key === availKey && !availResult.failed ? availResult.data : null;

  const phone = brand.phone;

  async function doCancel() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cancelBookingAction(token);
      if (result.ok) {
        setMode("cancelled");
        setNotice(null);
      } else {
        setError(`We couldn't cancel this booking just now. Please try again${phone ? `, or call us on ${phone}` : ""}.`);
      }
    } catch {
      setError(`We couldn't cancel this booking just now. Please try again${phone ? `, or call us on ${phone}` : ""}.`);
    } finally {
      setBusy(false);
    }
  }

  async function doReschedule(slot: PublicSlot) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rescheduleBookingAction(token, slot.start);
      if (result.ok) {
        setStartsAt(result.startIso);
        setMode("summary");
        setPendingSlot(null);
        setNotice("All moved! A confirmation email with the new time is on its way.");
      } else if (result.reason === "slot_taken" || result.reason === "slot_invalid") {
        setPendingSlot(null);
        setError("That time was just taken. here are fresh options.");
        setAvailNonce((n) => n + 1);
      } else {
        setError("This booking can no longer be changed.");
        setMode("summary");
      }
    } catch {
      setError(`Something went wrong on our side. Please try again${phone ? `, or call us on ${phone}` : ""}.`);
    } finally {
      setBusy(false);
    }
  }

  const bookAgainUrl = `/book?bm=${encodeURIComponent(staff.slug)}`;

  // ----- Terminal states -----

  if (mode === "cancelled") {
    const wasAlreadyCancelled = state === "cancelled";
    return (
      <BrandFrame brand={brand}>
        <section className={styles.card}>
          <h1 className={styles.pageTitle}>
            {wasAlreadyCancelled ? "This booking was cancelled" : "Your booking is cancelled"}
          </h1>
          <p className={styles.pageSub}>
            {wasAlreadyCancelled
              ? `The ${eventType.name.toLowerCase()} with ${staff.firstName} was cancelled, so there's nothing more to do here.`
              : `We've let ${staff.firstName} know. No call will go ahead, and a confirmation email is on its way.`}
          </p>
          <div className={styles.btnRow}>
            <a className={styles.primaryBtn} href={bookAgainUrl} style={{ textAlign: "center", textDecoration: "none" }}>
              Book another time with {staff.firstName}
            </a>
          </div>
          {phone && (
            <div className={styles.phoneBox}>
              <span>Rather talk it through? Call {brand.name}:</span>
              <a className={styles.phoneBig} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
            </div>
          )}
        </section>
      </BrandFrame>
    );
  }

  if (state === "past") {
    return (
      <BrandFrame brand={brand}>
        <section className={styles.card}>
          <h1 className={styles.pageTitle}>This call is in the past</h1>
          <p className={styles.pageSub}>
            Your {eventType.name.toLowerCase()} with {staff.firstName} on {formatFullDateTime(startsAt, tz)} has
            already happened, so it can no longer be changed.
          </p>
          <div className={styles.btnRow}>
            <a className={styles.primaryBtn} href={bookAgainUrl} style={{ textAlign: "center", textDecoration: "none" }}>
              Book a new call with {staff.firstName}
            </a>
          </div>
          {phone && (
            <div className={styles.phoneBox}>
              <span>Need anything else? Call {brand.name}:</span>
              <a className={styles.phoneBig} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
            </div>
          )}
        </section>
      </BrandFrame>
    );
  }

  // ----- Manageable booking -----

  return (
    <BrandFrame brand={brand}>
      <section className={styles.card}>
        <div className={styles.bmCard}>
          {staff.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={staff.photoUrl} alt={staff.firstName} className={styles.bmPhoto} />
          ) : (
            <span className={styles.bmPhotoFallback} aria-hidden="true">{staff.firstName.charAt(0)}</span>
          )}
          <div>
            <h1 className={styles.bmName}>Your call with {staff.firstName}</h1>
            <p className={styles.mutedText}>Hi {booking.guestName.split(" ")[0]}, here are your booking details.</p>
          </div>
        </div>

        {notice && <div className={styles.notice} role="status">{notice}</div>}
        {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</div>}

        <div className={styles.detailList}>
          <div>
            <span className={styles.detailLabel}>When</span>
            <span className={styles.detailValue}>{formatFullDateTime(startsAt, tz)}</span>
          </div>
          <div>
            <span className={styles.detailLabel}>What</span>
            <span className={styles.detailValue}>
              {eventType.name} ({eventType.durationMin} minutes)
            </span>
          </div>
          {booking.meetUrl && (
            <div>
              <span className={styles.detailLabel}>Where</span>
              <a className={styles.meetLink} href={booking.meetUrl} target="_blank" rel="noreferrer">
                Join your video call
              </a>
            </div>
          )}
        </div>

        <hr className={styles.divider} />

        {mode === "summary" && (
          <div className={styles.btnRow}>
            <button type="button" className={styles.secondaryBtn} onClick={() => { setMode("reschedule"); setNotice(null); setError(null); }}>
              Choose a different time
            </button>
            <button type="button" className={styles.dangerBtn} onClick={() => { setMode("confirm-cancel"); setNotice(null); setError(null); }}>
              Cancel this booking
            </button>
          </div>
        )}

        {mode === "confirm-cancel" && (
          <div className={styles.dayGroup}>
            <p className={styles.statusLine}>Cancel your call with {staff.firstName}?</p>
            <p className={styles.mutedText}>This will free the time and let {staff.firstName} know. You can always book again later.</p>
            <div className={styles.btnRow}>
              <button type="button" className={styles.dangerBtn} onClick={() => void doCancel()} disabled={busy}>
                {busy ? "Cancelling…" : "Yes, cancel the call"}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setMode("summary")} disabled={busy}>
                Keep my booking
              </button>
            </div>
          </div>
        )}

        {mode === "reschedule" && (
          <div className={styles.dayGroup}>
            <p className={styles.statusLine}>Pick a new time with {staff.firstName}</p>
            {pendingSlot ? (
              <div className={styles.dayGroup}>
                <div className={styles.slotSummary}>
                  Move your call to <strong>{formatFullDateTime(pendingSlot.start, tz)}</strong>?
                </div>
                <div className={styles.btnRow}>
                  <button type="button" className={styles.primaryBtn} onClick={() => void doReschedule(pendingSlot)} disabled={busy}>
                    {busy ? "Moving your call…" : "Confirm new time"}
                  </button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setPendingSlot(null)} disabled={busy}>
                    Pick another time
                  </button>
                </div>
              </div>
            ) : (
              <>
                {availLoading && (
                  <p className={styles.loadingText}>Finding {staff.firstName}&rsquo;s available times…</p>
                )}
                {availFailed && (
                  <div className={`${styles.notice} ${styles.noticeError}`}>
                    We couldn&rsquo;t load available times just now. Please try again
                    {phone ? `, or call us on ${phone}` : ""}.
                  </div>
                )}
                {availData !== null && availData.slots.length === 0 && (
                  <>
                    <div className={styles.notice}>
                      {availData.calendarReachable
                        ? `${staff.firstName} has no other open times right now.`
                        : `We can't load ${staff.firstName}'s calendar right now. it doesn't mean they're fully booked.`}
                    </div>
                    {phone && (
                      <div className={styles.phoneBox}>
                        <span>Call us and we&rsquo;ll move it for you:</span>
                        <a className={styles.phoneBig} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
                      </div>
                    )}
                  </>
                )}
                {availData !== null && availData.slots.length > 0 && (
                  <SlotPicker slots={availData.slots} timeZone={tz} onPick={setPendingSlot} />
                )}
                <button type="button" className={styles.linkBtn} onClick={() => { setMode("summary"); setPendingSlot(null); setError(null); }}>
                  Never mind. keep the current time
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </BrandFrame>
  );
}
