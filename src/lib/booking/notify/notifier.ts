// Outbound email behind an interface with two implementations, selected by
// environment (§17.3 stub-first policy):
//   BOOKING_NOTIFIER=live  + RESEND_API_KEY → LiveNotifier (Resend)
//   anything else                           → NoopNotifier (renders + records)
// The Noop path stores the fully-rendered payload in booking.audit_log so a
// Pod Lead can read the exact email a guest would receive before any real
// send happens.

import "server-only";

import { getSql } from "../db";

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
  /** For audit/debug context. */
  meta: {
    moment: string;
    brandKey: string;
    bookingId?: string;
  };
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface Notifier {
  readonly mode: "noop" | "live";
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

export function getNotifier(): Notifier {
  const apiKey = process.env.RESEND_API_KEY;
  if (process.env.BOOKING_NOTIFIER === "live" && apiKey) {
    return new LiveNotifier(apiKey);
  }
  return new NoopNotifier();
}
