// Template resolution and message composition. Resolution: most specific
// wins — (brand, event type) > (brand, all types) > global default. The
// seeded defaults below guarantee every moment always resolves to something
// sane even before anyone edits a template.

import "server-only";

import { DateTime } from "luxon";
import { appUrl } from "../app-url";
import { getSql } from "../db";
import { guestEventTypeName, type Brand, type EventType, type Staff } from "../model";
import { icsCancel, icsRequest } from "./ics.ts";
import { escapeHtml, htmlToText, renderBrandEmail, renderTemplate } from "./render.ts";
import type { VariableName } from "./variables.ts";
import { getNotifier, type OutboundMessage, type SendResult } from "./notifier";

export type Moment = "confirmation" | "reminder_24h" | "reminder_1h" | "cancellation" | "reschedule";

// Default copy follows the Leatherback Writing & Communication Guide
// ("Special Feeling"): conversational, contractions, greet → hug → clear
// answer → warm sign-off, one emoji at most, no travel clichés.
export const DEFAULT_TEMPLATES: Record<Moment, { subject: string; bodyHtml: string }> = {
  confirmation: {
    subject: "You're booked, {{guest.first_name}}! {{booking.meeting_date}} at {{booking.meeting_time}} with {{host.first_name}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Lovely news, your call with {{host.first_name}} is locked in! 🎉</p>" +
      "<p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}). We've set aside {{booking.duration}} just for you.</p>" +
      "<p>{{booking.join_details}}</p>" +
      "<p>Life happens. If that time stops working you can <a href=\"{{booking.reschedule_link}}\">reschedule</a> or <a href=\"{{booking.cancel_link}}\">cancel</a> whenever you need, no fuss.</p>" +
      "<p>We can't wait to hear what you're dreaming up.</p>" +
      "<p>Talk soon,<br/>{{host.first_name}} at {{brand.name}}</p>",
  },
  reminder_24h: {
    subject: "Tomorrow's the day, your call with {{host.first_name}} at {{booking.meeting_time}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Just a friendly nudge: you're chatting with {{host.first_name}} tomorrow, {{booking.meeting_date}}, at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p>" +
      "<p>{{booking.join_details}}</p>" +
      "<p>Day looking different than planned? <a href=\"{{booking.reschedule_link}}\">Reschedule here</a>. Takes seconds.</p>" +
      "<p>See you tomorrow!<br/>{{host.first_name}} at {{brand.name}}</p>",
  },
  reminder_1h: {
    subject: "Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}), about an hour from now.</p>" +
      "<p>Pop the kettle on. {{booking.join_details}}</p>" +
      "<p>See you very soon! ☕</p>",
  },
  cancellation: {
    subject: "Your call on {{booking.meeting_date}} has been cancelled",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled. All taken care of, nothing more for you to do.</p>" +
      "<p>If you'd still love a chat, <a href=\"{{booking.book_link}}\">book a new time</a> whenever suits you.</p>" +
      "<p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>",
  },
  reschedule: {
    subject: "All sorted. New time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}",
    bodyHtml:
      "<p>Hi {{guest.first_name}},</p>" +
      "<p>All sorted, your call with {{host.first_name}} has moved to <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p>" +
      "<p>{{booking.join_details}}</p>" +
      "<p>Need to juggle it again? <a href=\"{{booking.reschedule_link}}\">Reschedule</a> · <a href=\"{{booking.cancel_link}}\">Cancel</a>, whatever works for you.</p>" +
      "<p>See you then!<br/>{{host.first_name}} at {{brand.name}}</p>",
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
  /** How the guest asked to take the call; defaults to video. */
  callMedium?: "video" | "phone";
  guestPhone?: string | null;
  manageUrlRaw: string;
  brand: Brand;
  staff: Staff;
  eventType: EventType;
  tripName?: string | null;
  tripUrl?: string | null;
  icalSequence?: number;
};

/**
 * One line that fits the call however the guest chose to take it: the video
 * join link, or an honest "we'll ring you" for phone calls. HTML-safe: every
 * dynamic piece is escaped before assembly.
 */
function buildJoinDetails(ctx: BookingEmailContext): string {
  if ((ctx.callMedium ?? "video") === "phone") {
    const phone = ctx.guestPhone?.trim();
    return phone
      ? `${escapeHtml(ctx.staff.firstName)} will call you on <strong>${escapeHtml(phone)}</strong>. Keep your phone nearby.`
      : `${escapeHtml(ctx.staff.firstName)} will call you. Keep your phone nearby.`;
  }
  if (ctx.meetUrl) {
    const url = escapeHtml(ctx.meetUrl);
    return `When it's time, join here: <a href="${url}">${url}</a>`;
  }
  return "Your video link is on its way. It'll be in your reminder emails too.";
}

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
    "booking.meeting_date": start.toFormat("cccc d LLLL yyyy"),
    "booking.meeting_time": start.toFormat("h:mma").toLowerCase(),
    "booking.timezone": start.toFormat("ZZZZ"),
    "booking.duration": `${ctx.durationMin} minutes`,
    "booking.meet_link": ctx.meetUrl ?? "(video link to follow)",
    "booking.join_details": buildJoinDetails(ctx),
    "booking.reschedule_link": ctx.manageUrlRaw,
    "booking.cancel_link": `${ctx.manageUrlRaw}#cancel`,
    "booking.book_link": `${appUrl()}/book?bm=${encodeURIComponent(ctx.staff.slug)}&type=${encodeURIComponent(ctx.eventType.key)}`,
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

/**
 * Short plain-text SMS for the reminder moments. Sent only when the brand
 * has SMS reminders switched on AND the booking carries a guest phone.
 * Stub-first like email: the rendered text is recorded in audit_log as
 * sms_rendered_not_sent until an SMS provider is wired up.
 */
export async function sendBookingSms(moment: Moment, ctx: BookingEmailContext): Promise<SendResult> {
  const phone = ctx.guestPhone?.trim();
  if (!phone) return { ok: false, error: "no guest phone on the booking" };

  const values = buildVariableValues(ctx);
  const joinLine =
    (ctx.callMedium ?? "video") === "phone"
      ? `${ctx.staff.firstName} will call you. Keep your phone nearby.`
      : ctx.meetUrl
        ? `Join: ${ctx.meetUrl}`
        : "";
  const when =
    moment === "reminder_24h"
      ? `tomorrow at ${values["booking.meeting_time"]}`
      : `at ${values["booking.meeting_time"]}, about an hour away`;
  const text = [
    `${ctx.brand.name}: Hi ${values["guest.first_name"]}, your call with ${ctx.staff.firstName} is ${when} (${values["booking.timezone"]}).`,
    joinLine,
    `Reschedule: ${ctx.manageUrlRaw}`,
  ]
    .filter(Boolean)
    .join(" ");

  const sql = getSql();
  const id = `sms-noop-${Date.now().toString(36)}`;
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values ('system', 'sms_rendered_not_sent', ${phone}, ${JSON.stringify({
      id,
      text,
      moment,
      brandKey: ctx.brand.key,
      bookingId: ctx.bookingId,
    })}::jsonb)`;
  return { ok: true, id };
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
    summary: `${guestEventTypeName(ctx.eventType.key, ctx.eventType.name)} — ${ctx.brand.name}`,
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
    meta: {
      moment,
      brandKey: ctx.brand.key,
      bookingId: ctx.bookingId,
      helpscoutMailboxId: ctx.brand.helpscoutMailboxId,
      helpscoutUserId: ctx.staff.helpscoutUserId,
    },
  };
  return getNotifier().send(message);
}
