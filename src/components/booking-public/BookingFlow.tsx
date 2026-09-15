"use client";

// The single-page guest booking experience for /book. Resolution → (optional
// brand/team choice) → slot picker → confirmation form → success. All slots
// are fetched once per BM+type; paging is client-side.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usesAmericanEnglish } from "@/lib/booking/english";
import styles from "./bp.module.css";
import { COVER_GAP_DAYS, backupPlacement, coverSlotsFor, findCoverGap } from "./cover";
import { defaultEventTypeKey } from "./default-type";
import { BrandFrame } from "./BrandFrame";
import { ConfirmForm, type BookMeta, type BookedResult } from "./ConfirmForm";
import { SlotPicker } from "./SlotPicker";
import { TeamList } from "./TeamList";
import { formatDateOnly, formatDayShort, formatFullDateTime, formatSlotShort, guestTimeZone } from "./format";
import { resolveBrandPoolAction } from "@/app/book/actions";
import type {
  AvailabilityPayload,
  BackupEntry,
  PublicBrand,
  PublicBrandTrip,
  PublicDeparture,
  PublicEventType,
  PublicSlot,
  PublicStaff,
  ResolvePayload,
} from "./types";

type Ctx = {
  mode: "primary" | "pool";
  guestCountry: string | null;
  brand: PublicBrand;
  eventTypes: PublicEventType[];
  departures: PublicDeparture[];
  brandTrips: PublicBrandTrip[];
  primary: PublicStaff | null;
  poolLabel: string | null;
};

type ActiveStaff = {
  slug: string;
  firstName: string;
  photoUrl: string | null;
  bio: string | null;
  /** When false, this BM takes calls by phone only — no medium choice. */
  videoCallsEnabled: boolean;
  routedVia: "primary" | "backup" | "pool";
  routedReason: string | null;
};

// Fetch results are stored together with the request key that produced them;
// "loading" is derived (current key has no matching result yet), so effects
// never need a synchronous setState.
type AvailResult = { key: string; data: AvailabilityPayload | null; failed: boolean };
type BackupsResult = { key: string; list: BackupEntry[]; failed: boolean };

function sortDepartures(departures: PublicDeparture[]): PublicDeparture[] {
  return [...departures].sort((a, b) => {
    if (a.startDate === b.startDate) return 0;
    if (a.startDate === null) return 1;
    if (b.startDate === null) return -1;
    return a.startDate < b.startDate ? -1 : 1;
  });
}

export function BookingFlow({
  trip,
  host,
  bm,
  brand,
  tripRecord = null,
  source = null,
  typeParam,
  hero = null,
  embed,
}: {
  trip: string | null;
  host: string | null;
  bm: string | null;
  brand: string | null;
  /** Airtable trip record id — the guest portal's entry point. */
  tripRecord?: string | null;
  /** Booking origin, e.g. "portal"; recorded as the booking's source_kind. */
  source?: string | null;
  typeParam: string | null;
  /** Trip hero image (the host page's og:image), shown atop the embed card. */
  hero?: string | null;
  embed: boolean;
}) {
  // SSR only ever renders the loading card (resolution is a client fetch), so
  // a lazy client-side init never produces a hydration mismatch.
  const [tz] = useState(() => (typeof window === "undefined" ? "UTC" : guestTimeZone()));
  // Frozen at mount: reading the clock during render is impure, and a
  // three-day threshold does not care about minutes.
  const [nowMs] = useState(() => Date.now());
  // The trip the guest is enquiring about. Starts as the ?trip= slug and can
  // be swapped via "Not the right trip?" — a swap re-runs the whole resolve.
  const [tripSlug, setTripSlug] = useState(trip);
  const [changeTripOpen, setChangeTripOpen] = useState(false);
  const [resolveState, setResolveState] = useState<"loading" | "error" | "ready">("loading");
  const [brands, setBrands] = useState<{ key: string; name: string }[] | null>(null);
  // ?brand= contact-page links: the guest searches the brand's trips first.
  const [tripPicker, setTripPicker] = useState<{ brand: PublicBrand; guestCountry?: string | null; trips: PublicBrandTrip[] } | null>(null);
  const [tripQuery, setTripQuery] = useState("");
  const [brandPickPending, setBrandPickPending] = useState(false);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [eventTypeKey, setEventTypeKey] = useState<string | null>(null);
  const [departureId, setDepartureId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveStaff | null>(null);
  const [availResult, setAvailResult] = useState<AvailResult | null>(null);
  const [availNonce, setAvailNonce] = useState(0);
  const [backupsResult, setBackupsResult] = useState<BackupsResult | null>(null);
  const [showBackups, setShowBackups] = useState(false);
  const [selected, setSelected] = useState<PublicSlot | null>(null);
  // Video by default; the guest can flip to a phone call right where they
  // pick the time.
  // Deliberately no default (Nicola, 27 Aug): when both mediums are on offer
  // the guest must actively choose one before times appear.
  const [callMedium, setCallMedium] = useState<"video" | "phone" | null>(null);
  // The medium that actually books: phone-only BMs never get a video call,
  // whatever the toggle state said for a previously shown BM.
  const effectiveMedium: "video" | "phone" | null = active?.videoCallsEnabled ? callMedium : "phone";
  const [notice, setNotice] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookedResult | null>(null);

  const applyResolved = useCallback(
    (payload: Exclude<ResolvePayload, { kind: "brand-picker" } | { kind: "trip-picker" }>) => {
      const departures = sortDepartures(payload.departures);
      const primary = payload.kind === "primary" ? payload.staff : null;
      setCtx({
        guestCountry: (payload as { guestCountry?: string | null }).guestCountry ?? null,
        mode: payload.kind,
        brand: payload.brand,
        eventTypes: payload.eventTypes,
        departures,
        brandTrips: payload.brandTrips ?? [],
        primary,
        poolLabel: payload.kind === "pool" ? payload.poolLabel : null,
      });
      setEventTypeKey(defaultEventTypeKey(payload.eventTypes, typeParam, payload.brand.defaultEventTypeKey));
      setDepartureId(departures[0]?.airtableId ?? null);
      // A trip swap can move between primary and pool — always replace the
      // active BM rather than only setting it when a primary exists.
      setActive(primary ? { ...primary, routedVia: "primary", routedReason: null } : null);
      setSelected(null);
      setShowBackups(false);
      setResolveState("ready");
    },
    [typeParam],
  );

  // 1. Resolve who the guest is booking with.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (tripSlug) {
      params.set("trip", tripSlug);
      if (host) params.set("host", host);
    } else if (tripRecord) {
      // Portal entry: exact Airtable record. A "Not the right trip?" swap
      // sets tripSlug, which then takes precedence above.
      params.set("tripRecord", tripRecord);
    } else if (bm) {
      params.set("bm", bm);
      // Per-brand personal links (?bm=&brand=) frame the page in that brand;
      // without it a multi-brand BM's link falls back to their primary brand.
      if (brand) params.set("brand", brand);
    } else if (brand) {
      params.set("brand", brand);
    }
    const query = params.toString();
    fetch(`/api/booking/public/resolve${query ? `?${query}` : ""}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("resolve failed");
        return response.json() as Promise<ResolvePayload>;
      })
      .then((payload) => {
        if (payload.kind === "brand-picker") {
          setBrands(payload.brands);
          setResolveState("ready");
        } else if (payload.kind === "trip-picker") {
          setTripPicker({ brand: payload.brand, trips: payload.trips });
          setResolveState("ready");
        } else {
          applyResolved(payload);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setResolveState("error");
      });
    return () => controller.abort();
  }, [tripSlug, host, bm, brand, tripRecord, applyResolved]);

  // 2. Availability: fetched once per BM + event type, paged client-side.
  const brandKey = ctx?.brand.key ?? null;
  const activeSlug = active?.slug ?? null;
  const availKey =
    brandKey && activeSlug && eventTypeKey ? `${brandKey}|${activeSlug}|${eventTypeKey}|${availNonce}` : null;
  useEffect(() => {
    if (!availKey || !brandKey || !activeSlug || !eventTypeKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ staff: activeSlug, brand: brandKey, type: eventTypeKey });
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
  }, [availKey, brandKey, activeSlug, eventTypeKey]);

  const availLoading = availKey !== null && availResult?.key !== availKey;
  const availFailed = availKey !== null && availResult?.key === availKey && availResult.failed;
  const availData =
    availKey !== null && availResult?.key === availKey && !availResult.failed ? availResult.data : null;
  const calendarDown = availData !== null && !availData.calendarReachable && availData.slots.length === 0;
  const fullyBooked = availData !== null && availData.calendarReachable && availData.slots.length === 0;

  // Cover: when the primary's next opening is days away and a backup is free
  // sooner, that backup is offered inline rather than behind a click — a BM
  // on leave otherwise reads as a two-week hole in the calendar. Ordering,
  // never assignment: the guest still chooses (Nicola, 4 Sep).
  const primaryFirstMs = availData?.slots[0] ? new Date(availData.slots[0].start).getTime() : null;
  // Leave rarely starts today: a BM is typically free for a day or two, then
  // gone for a fortnight. So look for the GAP as well as a distant first
  // opening — otherwise tomorrow's slots hide next fortnight's hole.
  const coverGap = findCoverGap(availData?.slots ?? [], nowMs);
  const coverNeeded =
    active?.routedVia === "primary" &&
    availData !== null &&
    availData.calendarReachable &&
    (primaryFirstMs === null ||
      primaryFirstMs - nowMs > COVER_GAP_DAYS * 86_400_000 ||
      coverGap !== null);

  // 3. Team list: eagerly the whole pool UI when there is no primary, and
  //    lazily (click only) behind "Can't find a time that works?" otherwise.
  const poolNeedsTeam = ctx?.mode === "pool" && !active && Boolean(eventTypeKey);
  const backupsExclude = poolNeedsTeam ? null : activeSlug;
  const backupsKey =
    brandKey && eventTypeKey && (poolNeedsTeam || showBackups || coverNeeded)
      ? `${brandKey}|${eventTypeKey}|${backupsExclude ?? ""}`
      : null;
  useEffect(() => {
    if (!backupsKey || !brandKey || !eventTypeKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ brand: brandKey, type: eventTypeKey });
    if (backupsExclude) params.set("exclude", backupsExclude);
    fetch(`/api/booking/public/backups?${params}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("backups failed");
        return response.json() as Promise<{ backups: BackupEntry[] }>;
      })
      .then((payload) => setBackupsResult({ key: backupsKey, list: payload.backups, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setBackupsResult({ key: backupsKey, list: [], failed: true });
      });
    return () => controller.abort();
  }, [backupsKey, brandKey, eventTypeKey, backupsExclude]);

  // An abandoned scheduling request leaves nothing behind (Nicola, 8 Sep).
  // The hold is the only thing stored before a guest confirms, so it goes the
  // moment they walk away — closing the tab, backing out to the times, or
  // switching to another BM — rather than sitting out its 120 seconds.
  const holdId = useRef<string | null>(null);
  // Bumped whenever a choice is abandoned. A hold request still in flight at
  // that moment belongs to a guest who has already gone, so when its id
  // finally arrives it is released instead of kept — otherwise walking away
  // during the round trip leaves exactly the row this is meant to prevent.
  const holdGeneration = useRef(0);

  const releaseById = useCallback((id: string) => {
    const body = JSON.stringify({ holdId: id });
    // sendBeacon is the only request guaranteed to survive the page going
    // away; keepalive fetch covers browsers that refuse the beacon.
    const sent =
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/booking/public/hold/release", new Blob([body], { type: "application/json" }));
    if (!sent) {
      fetch("/api/booking/public/hold/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  const releaseHold = useCallback(() => {
    holdGeneration.current += 1;
    const id = holdId.current;
    if (!id) return;
    holdId.current = null;
    releaseById(id);
  }, [releaseById]);

  const takeHold = useCallback(
    (staffSlug: string, brandKey: string, typeKey: string, startIso: string) => {
      // Any previous choice is abandoned the instant a new one is made.
      releaseHold();
      const generation = holdGeneration.current;
      fetch("/api/booking/public/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffSlug, brandKey, eventTypeKey: typeKey, startIso }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((payload) => {
          const id = payload?.holdId ? String(payload.holdId) : null;
          if (!id) return;
          if (generation !== holdGeneration.current) {
            releaseById(id);
            return;
          }
          holdId.current = id;
        })
        .catch(() => {});
    },
    [releaseHold, releaseById],
  );

  // Every way out of a chosen time clears `selected` — the medium chooser's
  // "Pick a different time", the form's, a slot taken from under the guest, a
  // trip or BM swap. Watching that one piece of state covers them all,
  // instead of hoping each exit remembered to release (the medium chooser's
  // did not).
  useEffect(() => {
    if (selected === null) releaseHold();
  }, [selected, releaseHold]);

  // Every step starts at the top (Nicola, 15 Sep). Inside the website
  // embed and the pop-out overlay the panel scrolls within its own frame, so
  // a guest who picked a time near the bottom of a week saw the details form
  // open mid-scroll with the header cut off. The frame's own window is what
  // scrolls in every case, so this covers the inline embed, the overlay and
  // the standalone page alike.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
    // In an inline embed sized to its content the frame itself never
    // scrolls, so the host page must bring the frame's top into view.
    if (embed && window.parent !== window) {
      window.parent.postMessage({ type: "leatherback-booking-step" }, "*");
    }
  }, [selected, callMedium, booked, embed]);

  // Leaving the page: pagehide is the reliable one (mobile Safari never
  // guarantees beforeunload), and a tab hidden on mobile is often never
  // coming back, so that counts as leaving too.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") releaseHold();
    };
    window.addEventListener("pagehide", releaseHold);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", releaseHold);
      document.removeEventListener("visibilitychange", onHidden);
      // Unmounting is abandonment too: the widget overlay closing, or the
      // guest being routed elsewhere in the flow.
      releaseHold();
    };
  }, [releaseHold]);

  const pickSlot = (slot: PublicSlot) => {
    setSelected(slot);
    setNotice(null);
    if (ctx && active && eventTypeKey) {
      takeHold(active.slug, ctx.brand.key, eventTypeKey, slot.start);
    }
  };

  const chooseTeamMember = (entry: BackupEntry) => {
    if (!ctx) return;
    const cameFromPrimary = ctx.mode === "primary" && ctx.primary !== null;
    setActive({
      slug: entry.staff.slug,
      firstName: entry.staff.firstName,
      photoUrl: entry.staff.photoUrl,
      bio: entry.staff.bio,
      videoCallsEnabled: entry.staff.videoCallsEnabled,
      routedVia: cameFromPrimary ? "backup" : "pool",
      routedReason: cameFromPrimary
        ? `Chose ${entry.staff.firstName} from alternatives; ${ctx.primary!.firstName} had no suitable times.`
        : `Chose ${entry.staff.firstName} from the ${ctx.brand.name} team.`,
    });
    setShowBackups(false);
    setSelected(null);
    setNotice(null);
  };

  /** Take one of the cover BM's inline times: switch to them AND keep the
   *  slot, which chooseTeamMember deliberately clears. */
  const bookWithCover = (entry: BackupEntry, slot: PublicSlot) => {
    if (!ctx) return;
    setActive({
      slug: entry.staff.slug,
      firstName: entry.staff.firstName,
      photoUrl: entry.staff.photoUrl,
      bio: entry.staff.bio,
      videoCallsEnabled: entry.staff.videoCallsEnabled,
      routedVia: "backup",
      routedReason: `Chose ${entry.staff.firstName} from cover; ${
        ctx.primary?.firstName ?? "the primary BM"
      } had no times for ${COVER_GAP_DAYS}+ days.`,
    });
    setShowBackups(false);
    setNotice(null);
    setSelected(slot);
    if (eventTypeKey) {
      // Cosmetic hold, against the BM actually being booked.
      takeHold(entry.staff.slug, ctx.brand.key, eventTypeKey, slot.start);
    }
  };

  const backToPrimary = () => {
    if (!ctx?.primary) {
      setActive(null);
      return;
    }
    setActive({ ...ctx.primary, routedVia: "primary", routedReason: null });
    setSelected(null);
    setNotice(null);
    setShowBackups(false);
  };

  const openBackups = () => {
    // The backups fetch itself is driven by backupsKey becoming non-null.
    setShowBackups(true);
  };

  const changeTrip = (slug: string) => {
    if (!slug || slug === tripSlug) return;
    // Replace the whole resolution context: back to the loading card, then the
    // resolve effect re-runs with the new slug (same host) and applyResolved
    // swaps in the new BM, departures and slots.
    setChangeTripOpen(false);
    setNotice(null);
    setSelected(null);
    setShowBackups(false);
    setResolveState("loading");
    setTripSlug(slug);
  };

  const pickBrand = async (key: string) => {
    setBrandPickPending(true);
    try {
      const resolution = await resolveBrandPoolAction(key);
      if (!resolution) {
        setNotice("We couldn't load that brand just now. Please try again.");
        return;
      }
      setCtx({
        guestCountry: (resolution as { guestCountry?: string | null }).guestCountry ?? null,
        mode: "pool",
        brand: resolution.brand,
        eventTypes: resolution.eventTypes,
        departures: [],
        brandTrips: [],
        primary: null,
        poolLabel: resolution.poolLabel,
      });
      setEventTypeKey(
        defaultEventTypeKey(resolution.eventTypes, typeParam, resolution.brand.defaultEventTypeKey),
      );
      setActive(null);
      setNotice(null);
    } finally {
      setBrandPickPending(false);
    }
  };

  const onSlotTaken = (message: string) => {
    setNotice(message);
    setSelected(null);
    setAvailNonce((n) => n + 1);
  };

  const selectedDeparture = useMemo(() => {
    if (!ctx || ctx.departures.length === 0) return null;
    return ctx.departures.find((d) => d.airtableId === departureId) ?? ctx.departures[0];
  }, [ctx, departureId]);

  const eventType = ctx?.eventTypes.find((t) => t.key === eventTypeKey) ?? null;
  const phone = ctx?.brand.phone ?? null;

  // Embed overlay only, and only a real http(s) image URL — the param is
  // guest-controllable, so nothing else is ever rendered.
  const heroUrl = embed && hero && /^https?:\/\//.test(hero) ? hero : null;

  const meta: BookMeta | null =
    ctx && active && eventTypeKey && effectiveMedium !== null
      ? {
          staffSlug: active.slug,
          brandKey: ctx.brand.key,
          eventTypeKey,
          callMedium: effectiveMedium,
          sourceKind: source === "portal" ? "portal" : tripSlug || tripRecord ? "trip" : "bm",
          sourceSlug: tripSlug ?? tripRecord ?? bm ?? null,
          routedVia: active.routedVia,
          routedReason: active.routedReason,
          tripName: selectedDeparture?.title ?? null,
          tripUrl:
            selectedDeparture?.url && /^https?:\/\//.test(selectedDeparture.url)
              ? selectedDeparture.url
              : null,
          airtableTripRecordId:
            selectedDeparture && /^rec[A-Za-z0-9]+$/.test(selectedDeparture.airtableId)
              ? selectedDeparture.airtableId
              : null,
        }
      : null;

  // ---------------- Render ----------------

  if (resolveState === "loading") {
    return (
      <BrandFrame brand={null} embed={embed}>
        <section className={styles.card}>
          <p className={styles.loadingText}>Loading your booking page…</p>
        </section>
      </BrandFrame>
    );
  }

  if (resolveState === "error") {
    return (
      <BrandFrame brand={null} embed={embed}>
        <section className={styles.card}>
          <h1 className={styles.pageTitle}>We couldn&rsquo;t load this page</h1>
          <p className={styles.pageSub}>
            Something went wrong on our side. Please refresh the page to try again.
          </p>
        </section>
      </BrandFrame>
    );
  }

  // Trip picker (?brand= contact-page links): the guest finds their trip, and
  // the chosen trip resolves to its own coordinator — never a silent pool.
  if (!ctx && tripPicker) {
    const query = tripQuery.trim().toLowerCase();
    // Every word of the query must appear in the trip's title or one of its
    // destinations — so "Nepal" finds every Nepal trip, and "nepal trek"
    // narrows within them.
    const matches =
      query.length >= 2
        ? tripPicker.trips
            .filter((t) => {
              const haystack = [t.title, ...(t.destinations ?? [])].join(" ").toLowerCase();
              return query.split(/\s+/).every((word) => haystack.includes(word));
            })
            .slice(0, 12)
        : [];
    return (
      <BrandFrame brand={tripPicker.brand} embed={embed}>
        <section className={styles.card}>
          <h1 className={styles.pageTitle}>Book a call about your trip</h1>
          <p className={styles.pageSub}>
            Tell us which trip you&rsquo;re interested in and we&rsquo;ll connect you with the Booking Manager
            who runs it.
          </p>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="bp-trip-search">
              Your trip or destination
            </label>
            <input
              id="bp-trip-search"
              className={styles.input}
              type="search"
              autoComplete="off"
              placeholder="Start typing, e.g. Japan"
              value={tripQuery}
              onChange={(e) => setTripQuery(e.target.value)}
            />
          </div>
          {query.length >= 2 && matches.length === 0 && (
            <p className={styles.mutedText}>
              No trips match &ldquo;{tripQuery.trim()}&rdquo;. Try another word from the trip name, or a country it visits.
            </p>
          )}
          {matches.length > 0 && (
            <div className={styles.typeGrid}>
              {matches.map((t) => (
                <button key={t.slug} type="button" className={styles.typeBtn} onClick={() => changeTrip(t.slug)}>
                  <span className={styles.typeName}>{t.title}</span>
                  {(t.startDates?.length ?? 0) > 0 ? (
                    <span className={styles.typeMeta}>
                      Departs {t.startDates!.map((d) => formatDateOnly(d)).join(" · ")}
                    </span>
                  ) : t.startDate ? (
                    <span className={styles.typeMeta}>Departs {formatDateOnly(t.startDate)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>
      </BrandFrame>
    );
  }

  // Brand picker: no brand context yet.
  if (!ctx) {
    return (
      <BrandFrame brand={null} embed={embed}>
        <section className={styles.card}>
          <h1 className={styles.pageTitle}>Book a call with our team</h1>
          <p className={styles.pageSub}>Which of our travel brands would you like to talk to?</p>
          {notice && <div className={`${styles.notice} ${styles.noticeError}`}>{notice}</div>}
          <div className={styles.typeGrid}>
            {(brands ?? []).map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={styles.typeBtn}
                onClick={() => void pickBrand(entry.key)}
                disabled={brandPickPending}
              >
                <span className={styles.typeName}>{entry.name}</span>
              </button>
            ))}
          </div>
          {brandPickPending && <p className={styles.loadingText}>Opening the booking page…</p>}
        </section>
      </BrandFrame>
    );
  }

  // Success screen.
  if (booked && active && eventType) {
    return (
      <BrandFrame brand={ctx.brand} embed={embed}>
        <section className={styles.card}>
          <div className={styles.successIcon} aria-hidden="true">✓</div>
          <h1 className={styles.pageTitle}>You&rsquo;re booked with {active.firstName}!</h1>
          <div className={styles.detailList}>
            <div>
              <span className={styles.detailLabel}>When</span>
              <span className={styles.detailValue}>{formatFullDateTime(booked.startIso, tz)}</span>
            </div>
            <div>
              <span className={styles.detailLabel}>What</span>
              <span className={styles.detailValue}>
                {eventType.name} ({eventType.durationMin} minutes)
              </span>
            </div>
            {booked.meetUrl && (
              <div>
                <span className={styles.detailLabel}>Where</span>
                <a className={styles.meetLink} href={booked.meetUrl} target="_blank" rel="noreferrer">
                  Join your video call
                </a>
              </div>
            )}
          </div>
          {/* The address is echoed back (Nicola, 7 Sep): a booking once went
              out to someone else's inbox because the form was filled with a
              stale autofilled address, and nobody saw it until the wrong
              person replied. */}
          <p className={styles.pageSub}>
            A confirmation email is on its way to <strong>{booked.guestEmail}</strong>. Not your address? Call
            us and we&rsquo;ll fix it.
          </p>
          {booked.manageUrl && (
            <p className={styles.mutedText}>
              Need to change it later?{" "}
              <a className={styles.meetLink} href={booked.manageUrl}>
                Manage this booking
              </a>
            </p>
          )}
          {/* Save-our-number (Nicola, 15 Sep): a guest who has the brand in
              their contacts does not take the BM's call for spam. The card
              opens the phone's add-contact screen with name, email and
              numbers filled in. */}
          {phone && (
            <div className={styles.phoneBox}>
              <span className={styles.phoneLead}>
                Save our number so you know when {active.firstName} is calling
              </span>
              <a className={styles.phoneBig} href={`tel:${phone.replace(/\s/g, "")}`}>
                {phone}
              </a>
              <span className={styles.phoneNote}>
                Calls from {ctx.brand.name} come from this number. Unsaved numbers often get flagged as spam.
              </span>
              {/* On a phone the card opens straight into add-contact. On a
                  computer it would only download, and the call comes to the
                  phone anyway — so show a code for the phone to scan, with
                  the download as the fallback. Which one shows is decided by
                  CSS (pointer/hover), so there is no user-agent guessing. */}
              <a
                className={`${styles.saveContactBtn} ${styles.onPhone}`}
                href={`/api/booking/public/contact-card?brand=${encodeURIComponent(ctx.brand.key)}`}
                target="_blank"
                rel="noreferrer"
              >
                Save {ctx.brand.name} to my contacts
              </a>
              <div className={`${styles.scanRow} ${styles.onComputer}`}>
                <img
                  className={styles.scanCode}
                  src={`/api/booking/public/contact-card-qr?brand=${encodeURIComponent(ctx.brand.key)}`}
                  alt={`QR code that saves ${ctx.brand.name} to your phone's contacts`}
                  width={132}
                  height={132}
                />
                <span className={styles.scanText}>
                  <span className={styles.scanLead}>Scan with your phone to save {ctx.brand.name} to your contacts.</span>
                  <a
                    className={styles.meetLink}
                    href={`/api/booking/public/contact-card?brand=${encodeURIComponent(ctx.brand.key)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Or download the contact card
                  </a>
                </span>
              </div>
            </div>
          )}
        </section>
      </BrandFrame>
    );
  }


  const backupsLoading = backupsKey !== null && backupsResult?.key !== backupsKey;
  const backupsFailed = backupsKey !== null && backupsResult?.key === backupsKey && backupsResult.failed;
  const backupsList =
    backupsKey !== null && backupsResult?.key === backupsKey && !backupsResult.failed
      ? backupsResult.list
      : null;

  // The first backup who can genuinely help sooner than the primary.
  const coverEntry =
    (coverNeeded && backupsList
      ? backupsList.find((entry) => coverSlotsFor(entry, primaryFirstMs, coverGap?.startMs ?? null).length > 0)
      : null) ?? null;
  const coverSlots = coverEntry ? coverSlotsFor(coverEntry, primaryFirstMs, coverGap?.startMs ?? null).slice(0, 3) : [];

  // Cover (Nicola, 4 Sep): a BM on leave leaves a hole in the calendar, so
  // whoever backs them up is offered with real times — still the guest's
  // choice, never a swap. Placement follows how long the primary is quiet
  // for (Nicola, 8 Sep): a blank week or more and the backup sits up with
  // the times, otherwise it waits at the bottom of the panel.
  const coverPlacement = backupPlacement(primaryFirstMs, nowMs);
  const coverBlock =
    coverEntry && !selected && active ? (
      <div className={styles.coverBox}>
        <p className={styles.coverLead}>
          {coverGap !== null
            ? // A multi-day hole is almost always leave, so it gets the warm
              // line; sparse availability only gets the plain fact. No
              // pronouns: this copy renders for every BM.
              `${active.firstName} is off on an adventure and has limited availability until ${formatDayShort(new Date(coverGap.endMs).toISOString(), tz)}.`
            : primaryFirstMs === null
              ? `${active.firstName} has no times open at the moment.`
              : `${active.firstName}'s next opening is ${formatDayShort(availData!.slots[0].start, tz)}.`}
        </p>
        <div className={styles.coverWho}>
          {coverEntry.staff.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverEntry.staff.photoUrl}
              alt={coverEntry.staff.firstName}
              className={styles.coverPhoto}
            />
          ) : null}
          <p className={styles.coverSub}>
            In the meantime, <strong>{coverEntry.staff.firstName}</strong> also looks after {ctx.brand.name}{" "}
            and can talk sooner:
          </p>
        </div>
        <div className={styles.slotGrid}>
          {coverSlots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              className={styles.slotBtn}
              onClick={() => bookWithCover(coverEntry, slot)}
            >
              {formatSlotShort(slot.start, tz)}
            </button>
          ))}
        </div>
        <button type="button" className={styles.linkBtn} onClick={() => chooseTeamMember(coverEntry)}>
          See all of {coverEntry.staff.firstName}&rsquo;s times
        </button>
      </div>
    ) : null;

  return (
    <BrandFrame brand={ctx.brand} embed={embed}>
      <section className={styles.card}>
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt="" className={styles.heroImg} aria-hidden="true" />
        )}
        {/* Who the guest is booking with */}
        {active && active.routedVia === "primary" && ctx.primary ? (
          <div className={styles.bmCard}>
            {ctx.primary.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.primary.photoUrl} alt={ctx.primary.firstName} className={styles.bmPhoto} />
            ) : (
              <span className={styles.bmPhotoFallback} aria-hidden="true">
                {ctx.primary.firstName.charAt(0)}
              </span>
            )}
            <div>
              <h1 className={styles.bmName}>Book a call with {ctx.primary.firstName}</h1>
              {ctx.primary.bio && <p className={styles.bmBio}>{ctx.primary.bio}</p>}
            </div>
          </div>
        ) : active ? (
          <div className={styles.bmCard}>
            {active.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={active.photoUrl} alt={active.firstName} className={styles.bmPhoto} />
            ) : (
              <span className={styles.bmPhotoFallback} aria-hidden="true">
                {active.firstName.charAt(0)}
              </span>
            )}
            <div>
              <h1 className={styles.bmName}>Book a call with {active.firstName}</h1>
              <button type="button" className={styles.linkBtn} onClick={backToPrimary}>
                {ctx.primary ? `Back to ${ctx.primary.firstName}` : "Choose someone else"}
              </button>
            </div>
          </div>
        ) : (
          <h1 className={styles.pageTitle}>{ctx.poolLabel ?? `Book a call with the ${ctx.brand.name} team`}</h1>
        )}

        {/* A guest is never asked what kind of call this is (Nicola, 14 Sep):
            the link's ?type= or the brand's default decides, and the call and
            its length are simply stated here. The only choice a guest makes
            is phone or video, after picking a time. */}
        {eventType && (
          <p className={styles.pageSub}>
            {eventType.name} · {eventType.durationMin} minutes
          </p>
        )}

        {/* Trip context (trip-entry links only — never for ?bm= links) */}
        {tripSlug && ctx.departures.length > 0 && !selected && (
          <div className={styles.selectWrap}>
            <p className={styles.pageSub}>
              You&rsquo;re {usesAmericanEnglish(ctx.brand.key) ? "inquiring" : "enquiring"} about{" "}
              <strong>{ctx.departures[0].title}</strong>.
            </p>
            {ctx.brandTrips.length > 1 && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setChangeTripOpen((open) => !open)}
              >
                Not the right trip? Change it
              </button>
            )}
            {changeTripOpen && ctx.brandTrips.length > 1 && (
              <select
                className={styles.select}
                aria-label="Choose a different trip"
                value={ctx.brandTrips.some((t) => t.slug === tripSlug) ? tripSlug : ""}
                onChange={(e) => changeTrip(e.target.value)}
              >
                {!ctx.brandTrips.some((t) => t.slug === tripSlug) && (
                  <option value="" disabled>
                    Choose a trip…
                  </option>
                )}
                {ctx.brandTrips.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.title}
                    {t.startDate ? ` (departs ${formatDateOnly(t.startDate)})` : ""}
                  </option>
                ))}
              </select>
            )}
            {/* No guest-facing departure choice (Nicola, 1 Sep): the guest
                deals with the trip; the first upcoming departure quietly
                anchors the booking's internal trip metadata. */}
          </div>
        )}

        {notice && <div className={styles.notice} role="status">{notice}</div>}

        <hr className={styles.divider} />

        {/* Main area */}
        {selected && active && eventType && !meta ? (
          // Time chosen, medium not yet — the one question between the time
          // and the details form (video-enabled BMs only; phone-only BMs
          // skip straight to the form).
          <div className={styles.dayGroup}>
            <p className={styles.pageSub}>{formatFullDateTime(selected.start, tz)}</p>
            <div className={styles.mediumRow} role="radiogroup" aria-label="How would you like to take the call?">
              <span className={styles.sectionLabel}>How should we meet?</span>
              <button
                type="button"
                role="radio"
                aria-checked={callMedium === "video"}
                className={callMedium === "video" ? `${styles.mediumBtn} ${styles.mediumBtnActive}` : styles.mediumBtn}
                onClick={() => setCallMedium("video")}
              >
                Video call
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={callMedium === "phone"}
                className={callMedium === "phone" ? `${styles.mediumBtn} ${styles.mediumBtnActive}` : styles.mediumBtn}
                onClick={() => setCallMedium("phone")}
              >
                Phone call
              </button>
            </div>
            <button type="button" className={styles.linkBtn} onClick={() => setSelected(null)}>
              Pick a different time
            </button>
          </div>
        ) : selected && active && eventType && meta ? (
          <ConfirmForm
          guestCountry={ctx?.guestCountry ?? tripPicker?.guestCountry ?? null}
            slot={selected}
            timeZone={tz}
            staffFirstName={active.firstName}
            eventTypeName={eventType.name}
            phone={phone}
            brand={ctx.brand}
            meta={meta}
            onBack={() => setSelected(null)}
            onSuccess={(result) => {
              // The booking itself now owns the time; the hold is redundant.
              releaseHold();
              setBooked(result);
            }}
            onSlotTaken={onSlotTaken}
          />
        ) : !active ? (
          // Pool: guest chooses a team member. Never auto-assigned.
          <div className={styles.dayGroup}>
            <p className={styles.sectionLabel}>Choose who you&rsquo;d like to speak with</p>
            {backupsLoading && <p className={styles.loadingText}>Checking the team&rsquo;s calendars…</p>}
            {backupsFailed && (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                We couldn&rsquo;t load the team&rsquo;s availability just now. Please refresh to try again.
              </div>
            )}
            {backupsList !== null && backupsList.length === 0 && phone && (
              <div className={styles.phoneBox}>
                <span>Nobody has open times online right now. Call us and we&rsquo;ll find you a time:</span>
                <a className={styles.phoneBig} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
              </div>
            )}
            {backupsList !== null && backupsList.length > 0 && (
              <TeamList backups={backupsList} timeZone={tz} onPick={chooseTeamMember} />
            )}
          </div>
        ) : (
          <div className={styles.dayGroup}>
            {availLoading && (
              <p className={styles.loadingText}>Finding {active.firstName}&rsquo;s available times…</p>
            )}
            {availFailed && (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                We couldn&rsquo;t load available times just now. Please refresh to try again
                {phone ? `, or call us on ${phone}` : ""}.
              </div>
            )}
            {calendarDown && (
              <>
                <div className={styles.notice}>
                  We can&rsquo;t load {active.firstName}&rsquo;s calendar right now. It doesn&rsquo;t mean they&rsquo;re
                  fully booked.
                </div>
                {phone && (
                  <div className={styles.phoneBox}>
                    <span>Call us and we&rsquo;ll book you in directly:</span>
                    <a className={styles.phoneBig} href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
                  </div>
                )}
                <button type="button" className={styles.secondaryBtn} onClick={openBackups}>
                  See the rest of the team
                </button>
              </>
            )}
            {fullyBooked && (
              <>
                <div className={styles.notice}>
                  {active.firstName} has no open times in the next few weeks.
                </div>
                {!coverEntry && (
                  <button type="button" className={styles.secondaryBtn} onClick={openBackups}>
                    See who else can help
                  </button>
                )}
                {coverBlock}
              </>
            )}

            {availData !== null && availData.slots.length > 0 && (
              <>
                {/* Straight into times (Nicola, 1 Sep) — video/phone is asked
                    AFTER a time is picked. Phone-only BMs keep the one-line
                    heads-up since they are never asked at all. */}
                {!active.videoCallsEnabled && (
                  <div className={styles.mediumRow}>
                    <span className={styles.sectionLabel}>
                      This is a phone call: {active.firstName} will ring you at your chosen time.
                    </span>
                  </div>
                )}
                {coverPlacement === "with-times" && coverBlock}
                {coverPlacement === "with-times" && coverEntry && (
                  // The backup's times came first, so say whose these are.
                  <p className={styles.sectionLabel}>Or wait for {active.firstName}:</p>
                )}
                <SlotPicker slots={availData.slots} timeZone={tz} onPick={pickSlot} />
                {active.routedVia === "primary" && !showBackups && (
                  <button type="button" className={styles.linkBtn} onClick={openBackups}>
                    Can&rsquo;t find a time that works?
                  </button>
                )}
                {coverPlacement === "bottom" && coverBlock}
              </>
            )}
            {showBackups && (
              <div className={styles.dayGroup}>
                <p className={styles.sectionLabel}>Other people who can help</p>
                {backupsLoading && <p className={styles.loadingText}>Checking the team&rsquo;s calendars…</p>}
                {backupsFailed && (
                  <div className={`${styles.notice} ${styles.noticeError}`}>
                    We couldn&rsquo;t load the team just now. Please try again.
                  </div>
                )}
                {backupsList !== null && backupsList.length === 0 && (
                  <p className={styles.mutedText}>
                    Nobody else has open times online right now{phone ? ` — call us on ${phone} and we'll sort it out` : ""}.
                  </p>
                )}
                {backupsList !== null && backupsList.length > 0 && (
                  <TeamList backups={backupsList} timeZone={tz} onPick={chooseTeamMember} />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </BrandFrame>
  );
}
