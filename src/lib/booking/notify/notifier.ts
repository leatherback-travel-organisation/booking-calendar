// Outbound email behind an interface, selected by environment:
//   BOOKING_NOTIFIER=live + RESEND_API_KEY → LiveNotifier (Resend)
//   BOOKING_NOTIFIER=stub                  → NoopNotifier (renders + records)
//   otherwise, Help Scout configured       → HelpScoutNotifier (AUTOMATIC:
//     a real customer email from the brand mailbox, sent as the BM)
//   otherwise                              → NoopNotifier
// The Noop path stores the fully-rendered payload in booking.audit_log so a
// Pod Lead can read the exact email a guest would receive before any real
// send happens.

import "server-only";

import { getSql } from "../db";
import { helpscoutConfigured, sendCustomerEmail } from "../helpscout";

export type OutboundMessage = {
  to: string;
  toName?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  ics?: {
    filename: string;
    content: string;
    method: "REQUEST" | "CANCEL";
  };
  /** For audit/debug context — the Help Scout fields also route the send. */
  meta: {
    moment: string;
    brandKey: string;
    bookingId?: string;
    helpscoutMailboxId?: string | null;
    /** The BM's Help Scout user — the email is sent as them. */
    helpscoutUserId?: string | null;
  };
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface Notifier {
  readonly mode: "noop" | "live" | "helpscout";
  send(message: OutboundMessage): Promise<SendResult>;
}

class NoopNotifier implements Notifier {
  readonly mode = "noop" as const;

  async send(message: OutboundMessage): Promise<SendResult> {
    const sql = getSql();
    const id = `noop-${Date.now().toString(36)}`;
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values ('system', 'email_rendered_not_sent', ${message.to}, ${JSON.stringify({
        id,
        subject: message.subject,
        from: `${message.fromName} <${message.fromEmail}>`,
        moment: message.meta.moment,
        brandKey: message.meta.brandKey,
        bookingId: message.meta.bookingId ?? null,
        html: message.html,
        text: message.text,
        ics: message.ics ?? null,
      })}::jsonb)`;
    console.log(`[booking notifier noop] would send "${message.subject}" to ${message.to} (${message.meta.moment}, ${message.meta.brandKey})`);
    return { ok: true, id };
  }
}

class LiveNotifier implements Notifier {
  readonly mode = "live" as const;
  #apiKey: string;

  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${message.fromName} <${message.fromEmail}>`,
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.ics
          ? {
              attachments: [
                {
                  filename: message.ics.filename,
                  content: Buffer.from(message.ics.content).toString("base64"),
                  content_type: `text/calendar; charset=utf-8; method=${message.ics.method}`,
                },
              ],
            }
          : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !body.id) {
      return { ok: false, error: body.message ?? `Resend returned ${response.status}` };
    }
    return { ok: true, id: body.id };
  }
}

class HelpScoutNotifier implements Notifier {
  readonly mode = "helpscout" as const;

  async send(message: OutboundMessage): Promise<SendResult> {
    // A brand with no mailbox cannot send — record instead of vanishing.
    if (!message.meta.helpscoutMailboxId) {
      return new NoopNotifier().send(message);
    }
    try {
      const conversationId = await sendCustomerEmail({
        mailboxId: message.meta.helpscoutMailboxId,
        sentByUserId: message.meta.helpscoutUserId ?? null,
        guestName: message.toName ?? message.to,
        guestEmail: message.to,
        subject: message.subject,
        bodyHtml: message.html,
        ics: message.ics ? { filename: message.ics.filename, content: message.ics.content } : null,
      });
      return { ok: true, id: conversationId ?? "helpscout" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Help Scout send failed" };
    }
  }
}

export function getNotifier(): Notifier {
  const apiKey = process.env.RESEND_API_KEY;
  if (process.env.BOOKING_NOTIFIER === "live" && apiKey) {
    return new LiveNotifier(apiKey);
  }
  if (process.env.BOOKING_NOTIFIER !== "stub" && helpscoutConfigured()) {
    return new HelpScoutNotifier();
  }
  return new NoopNotifier();
}
