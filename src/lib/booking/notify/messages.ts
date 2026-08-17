// Template resolution and message composition. Resolution: most specific
// wins — (brand, event type) > (brand, all types) > global default. The
// seeded defaults below guarantee every moment always resolves to something
// sane even before anyone edits a template.

import "server-only";

import { DateTime } from "luxon";
import { getSql } from "../db";
import type { Brand, EventType, Staff } from "../model";
import { icsCancel, icsRequest } from "./ics.ts";
import { htmlToText, renderBrandEmail, renderTemplate } from "./render.ts";
import type { VariableName } from "./variables.ts";
import { getNotifier, type OutboundMessage, type SendResult } from "./notifier";

export type Moment = "confirmation" | "reminder_24h" | "reminder_1h" | "cancellation" | "reschedule" | "followup";

export const DEFAULT_TEMPLATES: Record<Moment, { subject: string; bodyHtml: string }> = {
  confirmation: {
    subject: "You're booked: {{booking.meeting_date}} at {{booking.meeting_time}} with {{host.first_name}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>You're booked for a call with {{host.first_name}} on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}). We've set aside {{booking.duration}}.</p>" +
      "<p>Join here when it's time: <a href=\"{{booking.meet_link}}\">{{booking.meet_link}}</a></p>" +
      "<p>Plans change? You can <a href=\"{{booking.reschedule_link}}\">reschedule</a> or <a href=\"{{booking.cancel_link}}\">cancel</a> any time.</p>" +
      "<p>Talk soon,<br/>{{host.first_name}} at {{brand.name}}</p>",
  },
  reminder_24h: {
    subject: "Tomorrow: your call with {{host.first_name}} at {{booking.meeting_time}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Just a reminder that you're speaking with {{host.first_name}} tomorrow, {{booking.meeting_date}}, at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p>" +
      "<p>Join link: <a href=\"{{booking.meet_link}}\">{{booking.meet_link}}</a></p>" +
      "<p>Need to move it? <a href=\"{{booking.reschedule_link}}\">Reschedule here</a>.</p>",
  },
  reminder_1h: {
    subject: "Starting soon: your call with {{host.first_name}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Your call with {{host.first_name}} starts at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — that's about an hour from now.</p>" +
      "<p>Join link: <a href=\"{{booking.meet_link}}\">{{booking.meet_link}}</a></p>",
  },
  cancellation: {
    subject: "Your call on {{booking.meeting_date}} has been cancelled",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) has been cancelled.</p>" +
      "<p>If you'd like to find a new time, we'd love to talk: call us on {{brand.phone}} or book again any time.</p>",
  },
  reschedule: {
    subject: "New time confirmed: {{booking.meeting_date}} at {{booking.meeting_time}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Your call with {{host.first_name}} has moved to <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p>" +
      "<p>The same join link still works: <a href=\"{{booking.meet_link}}\">{{booking.meet_link}}</a></p>" +
      "<p><a href=\"{{booking.reschedule_link}}\">Reschedule again</a> · <a href=\"{{booking.cancel_link}}\">Cancel</a></p>",
  },
  followup: {
    subject: "Great to talk, {{guest.first_name}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Thanks for making the time to speak with {{host.first_name}}. If anything else comes to mind, just reply to this email or call us on {{brand.phone}}.</p>",
  },
};

export async function resolveTemplate(
  moment: Moment,
  brandId: string,
  eventTypeKey: string,
): Promise<{ subject: string; bodyHtml: string; source: "brand-type" | "brand" | "default" }> {
  const sql = getSql();
  const rows = await sql`
    select subject, body_html, brand_id, event_type_key
    from booking.message_template
    where moment = ${moment} and active
      and (brand_id = ${brandId} or brand_id is null)
      and (event_type_key = ${eventTypeKey} or event_type_key is null)
    order by (brand_id is not null) desc, (event_type_key is not null) desc
    limit 1`;
  if (rows.length > 0) {
    const row = rows[0];
    return {
      subject: String(row.subject),
      bodyHtml: String(row.body_html),
      source: row.brand_id ? (row.event_type_key ? "brand-type" : "brand") : "default",
    };
  }
  return { ...DEFAULT_TEMPLATES[moment], source: "default" };
}

export type BookingEmailContext = {
  bookingId: string;
  guestName: string;
  guestEmail: string;
  guestTimezone: string | null;
  startIso: string;
  endIso: string;
  durationMin: number;
  meetUrl: string | null;
  manageUrlRaw: string;
  brand: Brand;
  staff: Staff;
  eventType: EventType;
  tripName?: string | null;
  tripUrl?: string | null;
  icalSequence?: number;
};

export function buildVariableValues(ctx: BookingEmailContext): Partial<Record<VariableName, string>> {
  // Guests always see their own timezone; the abbreviation is displayed next
  // to the time so a VPN/travel mismatch is visible at a glance (§6.1).
  const zone = ctx.guestTimezone ?? ctx.brand.schedulingTimezone;
  const start = DateTime.fromISO(ctx.startIso).setZone(zone);
  const guestFirst = ctx.guestName.trim().split(/\s+/)[0] ?? ctx.guestName;
  return {
    "guest.first_name": guestFirst,
    "guest.full_name": ctx.guestName,
    "guest.email": ctx.guestEmail,
    "booking.meeting_date": start.toFormat("cccc d LLLL"),
    "booking.meeting_time": start.toFormat("h:mma").toLowerCase(),
    "booking.timezone": start.toFormat("ZZZZ"),
    "booking.duration": `${ctx.durationMin} minutes`,
    "booking.meet_link": ctx.meetUrl ?? "(video link to follow)",
    "booking.reschedule_link": ctx.manageUrlRaw,
    "booking.cancel_link": `${ctx.manageUrlRaw}#cancel`,
    "host.first_name": ctx.staff.firstName,
    "host.full_name": ctx.staff.fullName,
    "host.email": ctx.staff.email,
    "host.photo": ctx.staff.photoUrl ?? "",
    "host.bio": ctx.staff.bio ?? "",
    "brand.name": ctx.brand.name,
    "brand.logo": ctx.brand.logoUrl ?? "",
    "brand.phone": ctx.brand.phoneDefault ?? ctx.brand.phoneAu ?? "",
    "trip.name": ctx.tripName ?? "",
    "trip.url": ctx.tripUrl ?? "",
    "trip.departure_date": "",
  };
}

export async function sendBookingEmail(moment: Moment, ctx: BookingEmailContext): Promise<SendResult> {
  const template = await resolveTemplate(moment, ctx.brand.id, ctx.eventType.key);
  const values = buildVariableValues(ctx);
  const bodyHtml = renderTemplate(template.bodyHtml, values);
  const subject = renderTemplate(template.subject, values);
  const html = renderBrandEmail(
    {
      brandName: ctx.brand.name,
      logoUrl: ctx.brand.logoUrl,
      colorPrimary: ctx.brand.colorPrimary,
      supportPhone: ctx.brand.phoneDefault ?? ctx.brand.phoneAu,
      fromName: ctx.brand.fromName,
    },
    bodyHtml,
  );

  const icsEvent = {
    uid: `booking-${ctx.bookingId}@cove.leatherbacktravel.com`,
    sequence: ctx.icalSequence ?? 0,
    startIso: ctx.startIso,
    endIso: ctx.endIso,
    summary: `${ctx.eventType.name} — ${ctx.brand.name}`,
    description: `Your call with ${ctx.staff.firstName} from ${ctx.brand.name}.${ctx.meetUrl ? ` Join: ${ctx.meetUrl}` : ""}`,
    organizerName: ctx.staff.fullName,
    organizerEmail: ctx.staff.email,
    attendeeName: ctx.guestName,
    attendeeEmail: ctx.guestEmail,
    url: ctx.meetUrl ?? undefined,
  };
  const wantsIcs = moment === "confirmation" || moment === "reschedule" || moment === "cancellation";
  const message: OutboundMessage = {
    to: ctx.guestEmail,
    toName: ctx.guestName,
    fromEmail: ctx.brand.fromEmail,
    fromName: ctx.brand.fromName,
    replyTo: ctx.brand.replyTo,
    subject,
    html,
    text: htmlToText(bodyHtml),
    ...(wantsIcs
      ? {
          ics: {
            filename: "invite.ics",
            content: moment === "cancellation" ? icsCancel(icsEvent) : icsRequest(icsEvent),
            method: moment === "cancellation" ? ("CANCEL" as const) : ("REQUEST" as const),
          },
        }
      : {}),
    meta: { moment, brandKey: ctx.brand.key, bookingId: ctx.bookingId },
  };
  return getNotifier().send(message);
}
