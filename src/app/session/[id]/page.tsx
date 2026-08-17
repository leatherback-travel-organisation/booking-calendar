// Public group-session join page. Guests claim a seat; the roster is never
// disclosed to other guests.

import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { getSession } from "@/lib/booking/groups";
import { resolveSchedulingZone } from "@/lib/booking/availability/engine";
import { claimSeatAction } from "./actions";
import styles from "@/components/booking-public-lite/lite.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a group call",
  referrer: "no-referrer",
};

export default async function GroupSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; claimed?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = /^[0-9a-f-]{36}$/.test(id) ? await getSession(id) : null;

  if (!session || session.status === "cancelled" || session.status === "held") {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This session isn&apos;t available</h1>
          <p className={styles.meta}>It may have been cancelled. You can still book a one-on-one call instead.</p>
          <a className={styles.moreLink} href="/book">Find a time that suits you →</a>
        </div>
      </main>
    );
  }

  const staff = await getStaffById(session.staffId);
  const eventType = await getEventTypeById(session.eventTypeId);
  const brand = staff?.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
  if (!staff || !eventType || !brand) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This session isn&apos;t available</h1>
          <a className={styles.moreLink} href="/book">Book a one-on-one call instead →</a>
        </div>
      </main>
    );
  }

  const zone = resolveSchedulingZone(staff, brand);
  const start = DateTime.fromISO(session.startsAt).setZone(zone);
  const seatsLeft = Math.max(session.capacity - session.seatsTaken, 0);
  const full = session.status === "full" || seatsLeft === 0;
  const theme = { "--bp-primary": brand.colorPrimary ?? "#1f3d33" } as React.CSSProperties;

  return (
    <main className={styles.page} style={theme}>
      <div className={styles.card}>
        <div className={styles.brandRow}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.brandLogo} src={brand.logoUrl} alt={brand.name} />
          ) : (
            <span className={styles.brandName}>{brand.name}</span>
          )}
        </div>
        <h1 className={styles.title}>{eventType.name} with {staff.firstName}</h1>
        <p className={styles.meta}>
          {start.toFormat("cccc d LLLL yyyy, h:mma")} ({start.toFormat("ZZZZ")}) · {eventType.durationMin} minutes
        </p>
        <p className={styles.meta}>Times shown in {zone}. Your confirmation email shows your local time.</p>
        <span className={styles.seats}>
          {full ? "This session is full" : `${seatsLeft} of ${session.capacity} spots left`}
        </span>

        <div className={styles.hostRow}>
          {staff.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.hostPhoto} src={staff.photoUrl} alt="" />
          ) : null}
          <p className={styles.meta}>{staff.bio ?? `${staff.firstName} will host this call.`}</p>
        </div>

        {error === "session_full" || full ? (
          <div>
            {error === "session_full" ? (
              <p className={styles.error}>That last spot was just taken — sorry! You can book a one-on-one instead.</p>
            ) : null}
            <a className={styles.moreLink} href={`/book?bm=${staff.slug}&type=${eventType.key}`}>
              Book a one-on-one with {staff.firstName} →
            </a>
          </div>
        ) : (
          <form className={styles.form} action={claimSeatAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <input type="hidden" name="guestTimezone" value="" />
            {error === "details" ? <p className={styles.error}>Please fill in your name and a valid email.</p> : null}
            <label className={styles.label}>
              Your name
              <input className={styles.input} name="guestName" required maxLength={200} autoComplete="name" />
            </label>
            <label className={styles.label}>
              Email
              <input className={styles.input} type="email" name="guestEmail" required maxLength={320} autoComplete="email" />
            </label>
            <label className={styles.label}>
              Phone (optional)
              <input className={styles.input} name="guestPhone" maxLength={50} autoComplete="tel" />
            </label>
            <div className={styles.honeypot} aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <button className={styles.button} type="submit">Save my spot</button>
          </form>
        )}
      </div>
      {brand.phoneDefault || brand.phoneAu ? (
        <p className={styles.footer}>
          Prefer to talk now? Call {brand.name} on{" "}
          <a href={`tel:${(brand.phoneDefault ?? brand.phoneAu ?? "").replace(/\s+/g, "")}`}>
            {brand.phoneDefault ?? brand.phoneAu}
          </a>
        </p>
      ) : null}
    </main>
  );
}
