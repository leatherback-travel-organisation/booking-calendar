// BM-initiated shortlists (§ Phase 9): a Booking Manager proposes a handful
// of times; the guest picks one, or opens the BM's full availability. The
// invitation always books the SAME BM who sent it.

import "server-only";

import { getSql } from "./db";
import type { Brand, EventType, Staff } from "./model";
import type { Interval } from "./model";
import { createBooking, type CreateBookingResult } from "./service";
import { issueToken, tokenMatches } from "./tokens";
import { appUrl } from "./app-url";

export type Invitation = {
  id: string;
  staffId: string;
  eventTypeId: string;
  guestName: string | null;
  guestEmail: string | null;
  candidates: Interval[];
  status: "pending" | "confirmed" | "expired";
  bookingId: string | null;
  expiresAt: string;
};

function mapInvitation(row: Record<string, unknown>): Invitation {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    eventTypeId: String(row.event_type_id),
    guestName: (row.guest_name as string | null) ?? null,
    guestEmail: (row.guest_email as string | null) ?? null,
    candidates: (row.candidates as Interval[]) ?? [],
    status: row.status as Invitation["status"],
    bookingId: (row.booking_id as string | null) ?? null,
    expiresAt: new Date(row.expires_at as string).toISOString(),
  };
}

export async function createInvitation(args: {
  staff: Staff;
  eventType: EventType;
  candidates: Interval[];
  guestName?: string | null;
  guestEmail?: string | null;
  expiresDays?: number;
  actorEmail: string;
}): Promise<{ invitationId: string; url: string }> {
  const sql = getSql();
  const token = issueToken();
  const expiresAt = new Date(Date.now() + (args.expiresDays ?? 7) * 86_400_000).toISOString();
  const rows = await sql`
    insert into booking.bm_invitation (staff_id, event_type_id, guest_name, guest_email, candidates, token_hash, expires_at)
    values (${args.staff.id}, ${args.eventType.id}, ${args.guestName ?? null}, ${args.guestEmail ?? null},
            ${JSON.stringify(args.candidates)}::jsonb, ${token.hash}, ${expiresAt})
    returning id`;
  const invitationId = String(rows[0].id);
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${args.actorEmail}, 'invitation_created', ${invitationId}, ${JSON.stringify({
      staff: args.staff.email,
      candidateCount: args.candidates.length,
    })}::jsonb)`;
  const base = appUrl();
  return { invitationId, url: `${base}/invite/${token.raw}` };
}

export async function findInvitationByToken(rawToken: string): Promise<Invitation | null> {
  const sql = getSql();
  if (!rawToken || rawToken.length < 16 || rawToken.length > 128) return null;
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(rawToken).digest();
  const rows = await sql`select * from booking.bm_invitation where token_hash = ${hash}`;
  if (rows.length === 0) return null;
  if (!tokenMatches(rawToken, rows[0].token_hash as Uint8Array)) return null;
  const invitation = mapInvitation(rows[0]);
  if (invitation.status === "pending" && new Date(invitation.expiresAt).getTime() < Date.now()) {
    await sql`update booking.bm_invitation set status = 'expired' where id = ${invitation.id} and status = 'pending'`;
    return { ...invitation, status: "expired" };
  }
  return invitation;
}

/** Candidate times still in the future (kept out of component render for
 * the React-compiler purity rules). */
export function futureCandidates(invitation: Invitation): Interval[] {
  const now = Date.now();
  return invitation.candidates.filter((c) => new Date(c.start).getTime() > now);
}

export async function acceptInvitation(args: {
  invitation: Invitation;
  staff: Staff;
  brand: Brand;
  eventType: EventType;
  chosenStartIso: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  guestTimezone?: string | null;
  idempotencyKey: string;
  appUrl: string;
}): Promise<CreateBookingResult | { ok: false; reason: "invitation_closed" }> {
  if (args.invitation.status !== "pending") return { ok: false, reason: "invitation_closed" };
  const result = await createBooking({
    staff: args.staff,
    brand: args.brand,
    eventType: args.eventType,
    startIso: args.chosenStartIso,
    guestName: args.guestName,
    guestEmail: args.guestEmail,
    guestPhone: args.guestPhone ?? null,
    guestTimezone: args.guestTimezone ?? null,
    sourceKind: "invite",
    sourceSlug: args.invitation.id,
    routedVia: "primary",
    idempotencyKey: args.idempotencyKey,
    appUrl: args.appUrl,
  });
  if (result.ok) {
    const sql = getSql();
    await sql`
      update booking.bm_invitation
         set status = 'confirmed', booking_id = ${result.bookingId}
       where id = ${args.invitation.id} and status = 'pending'`;
  }
  return result;
}
