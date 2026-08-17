// BM-initiated shortlist: the guest picks one of the proposed times, or opens
// the BM's full availability. Same BM either way — always.

import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { findInvitationByToken, futureCandidates } from "@/lib/booking/invitations";
import { acceptInvitationAction } from "./actions";
import styles from "@/components/booking-public-lite/lite.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a time",
  referrer: "no-referrer",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; pick?: string }>;
}) {
  const { token } = await params;
  const { error, pick } = await searchParams;
  const invitation = await findInvitationByToken(token);

  if (!invitation) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This link isn&apos;t valid</h1>
          <p className={styles.meta}>It may have been mistyped. You can still book a call any time.</p>
          <a className={styles.moreLink} href="/book">Find a time →</a>
        </div>
      </main>
    );
  }

  const staff = await getStaffById(invitation.staffId);
  const eventType = await getEventTypeById(invitation.eventTypeId);
  const brand = staff?.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
  if (!staff || !eventType || !brand) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>This link isn&apos;t valid</h1>
          <a className={styles.moreLink} href="/book">Find a time →</a>
        </div>
      </main>
    );
  }

  const theme = { "--bp-primary": brand.colorPrimary ?? "#1f3d33" } as React.CSSProperties;

  if (invitation.status !== "pending") {
    return (
      <main className={styles.page} style={theme}>
        <div className={styles.card}>
          <h1 className={styles.title}>
            {invitation.status === "confirmed" ? "You're already booked in" : "These times have expired"}
          </h1>
          <p className={styles.meta}>
            {invitation.status === "confirmed"
              ? `Your call with ${staff.firstName} is confirmed — check your email for the details.`
              : `${staff.firstName}'s proposed times have lapsed, but you can still pick from the full calendar.`}
          </p>
          <a className={styles.moreLink} href={`/book?bm=${staff.slug}&type=${eventType.key}`}>
            See {staff.firstName}&apos;s availability →
          </a>
        </div>
      </main>
    );
  }

  const candidates = futureCandidates(invitation);
  const chosen = pick && candidates.some((c) => c.start === pick) ? pick : null;

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
        <div className={styles.hostRow}>
          {staff.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.hostPhoto} src={staff.photoUrl} alt="" />
          ) : null}
          <div>
            <h1 className={styles.title}>{staff.firstName} suggested some times</h1>
            <p className={styles.meta}>{eventType.name} · {eventType.durationMin} minutes{invitation.guestName ? ` · for ${invitation.guestName}` : ""}</p>
          </div>
        </div>

        {error === "slot_taken" ? (
          <p className={styles.error}>That time was taken in the meantime — pick another, or open the full calendar below.</p>
        ) : null}
        {error === "details" ? <p className={styles.error}>Please fill in your name and a valid email.</p> : null}

        {candidates.length === 0 ? (
          <p className={styles.meta}>All the proposed times have passed — the full calendar is still open:</p>
        ) : (
          <div className={styles.slotList}>
            {candidates.map((candidate) => {
              const dt = DateTime.fromISO(candidate.start);
              const label = `${dt.toFormat("cccc d LLLL")} · ${dt.toFormat("h:mma").toLowerCase()} (${dt.toFormat("ZZZZ")})`;
              const isChosen = chosen === candidate.start;
              return (
                <a
                  key={candidate.start}
                  className={`${styles.slotButton} ${isChosen ? styles.slotChosen : ""}`}
                  href={`/invite/${token}?pick=${encodeURIComponent(candidate.start)}`}
                >
                  {label}
                </a>
              );
            })}
          </div>
        )}

        {chosen ? (
          <form className={styles.form} action={acceptInvitationAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="startIso" value={chosen} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label className={styles.label}>
              Your name
              <input className={styles.input} name="guestName" required maxLength={200} defaultValue={invitation.guestName ?? ""} autoComplete="name" />
            </label>
            <label className={styles.label}>
              Email
              <input className={styles.input} type="email" name="guestEmail" required maxLength={320} defaultValue={invitation.guestEmail ?? ""} autoComplete="email" />
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
            <button className={styles.button} type="submit">Confirm this time</button>
          </form>
        ) : null}

        <a className={styles.moreLink} href={`/book?bm=${staff.slug}&type=${eventType.key}`}>
          None of these work? See all of {staff.firstName}&apos;s times →
        </a>
      </div>
    </main>
  );
}
