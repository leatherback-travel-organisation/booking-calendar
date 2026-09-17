// Calendar event titles (Nicola, 17 Sep): on a shared calendar the first
// thing anyone needs is who is taking the call, so every title starts with
// the Booking Manager's first name. Pure, used by booking, move, group
// sessions and the CallTime Cal backfill so the four never drift apart.

import { guestEventTypeName } from "./model.ts";

export function bookingEventSummary(args: {
  bmFirstName: string;
  eventTypeKey: string;
  eventTypeName: string;
  guestName: string;
  callMedium: "video" | "phone";
  sourceKind?: string | null;
}): string {
  return (
    `${args.bmFirstName} · ${guestEventTypeName(args.eventTypeKey, args.eventTypeName)} · ${args.guestName}` +
    (args.callMedium === "phone" ? " (phone)" : "") +
    (args.sourceKind === "portal" ? " (portal)" : "")
  );
}

export function groupSessionSummary(args: { bmFirstName: string; eventTypeName: string; capacity: number }): string {
  return `${args.bmFirstName} · ${args.eventTypeName} (group) — ${args.capacity} seats`;
}
