// Help Scout integration. Creates conversations via the Mailbox API 2.0 —
// never an inbound email, because inbound emails cannot be programmatically
// assigned. Additive to the BMs' existing manual process, never a replacement.
// Without credentials this is a stub that records what it would have done.

import "server-only";

import { getSql } from "./db";

let cachedToken: { token: string; expiresAtMs: number } | null = null;

export function helpscoutConfigured(): boolean {
  return Boolean(process.env.HELPSCOUT_APP_ID && process.env.HELPSCOUT_APP_SECRET);
}

async function helpscoutToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) return cachedToken.token;
  const response = await fetch("https://api.helpscout.net/v2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.HELPSCOUT_APP_ID!,
      client_secret: process.env.HELPSCOUT_APP_SECRET!,
    }),
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new Error(`Help Scout auth failed (${response.status})`);
  cachedToken = { token: body.access_token, expiresAtMs: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

export type HelpscoutNoteInput = {
  mailboxId: string;
  /** Assign only when the booking went to the primary BM; backup/pool stays
   * unassigned with the routing reason in the body — visible, never silent. */
  assignToUserId: string | null;
  guestName: string;
  guestEmail: string;
  subject: string;
  bodyHtml: string;
  /** Conversation tags (new conversations only), e.g. ["crossover"]. */
  tags?: string[];
  existingConversationId?: string | null;
};


/** First + last split so Help Scout lists the guest by name, not address. */
function guestCustomer(fullName: string, email: string): { email: string; firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || email;
  const lastName = parts.slice(1).join(" ");
  return lastName ? { email, firstName, lastName } : { email, firstName };
}

export async function createOrThreadConversation(input: HelpscoutNoteInput): Promise<string | null> {
  if (!helpscoutConfigured()) {
    const sql = getSql();
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values ('system', 'helpscout_stubbed', ${input.guestEmail}, ${JSON.stringify({
        wouldCreate: input.existingConversationId ? "thread" : "conversation",
        mailboxId: input.mailboxId,
        assignTo: input.assignToUserId,
        subject: input.subject,
        tags: input.tags ?? null,
        bodyHtml: input.bodyHtml,
      })}::jsonb)`;
    return null;
  }

  const token = await helpscoutToken();
  if (input.existingConversationId) {
    const response = await fetch(
      `https://api.helpscout.net/v2/conversations/${input.existingConversationId}/notes`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.bodyHtml }),
      },
    );
    if (!response.ok) throw new Error(`Help Scout note failed (${response.status})`);
    return input.existingConversationId;
  }

  const response = await fetch("https://api.helpscout.net/v2/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.subject,
      mailboxId: Number(input.mailboxId),
      type: "email",
      status: "active",
      customer: guestCustomer(input.guestName, input.guestEmail),
      ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
      ...(input.assignToUserId ? { assignTo: Number(input.assignToUserId) } : {}),
      threads: [
        {
          type: "note",
          text: input.bodyHtml,
        },
      ],
    }),
  });
  if (response.status !== 201) throw new Error(`Help Scout conversation failed (${response.status})`);
  const location = response.headers.get("Resource-ID") ?? response.headers.get("Location")?.split("/").pop();
  return location ?? null;
}

export type HelpscoutEmailInput = {
  mailboxId: string;
  /** HS user the email is sent AS (the BM) — omitted, the mailbox default sends. */
  sentByUserId: string | null;
  guestName: string;
  guestEmail: string;
  subject: string;
  bodyHtml: string;
  /** BM crib sheet, added as an internal note ABOVE the guest email — just
      the facts they need to make the call, reach the guest, log the CRM. */
  internalNote?: string | null;
  ics?: { filename: string; content: string } | null;
};

/**
 * Send a real customer email through Help Scout: an outbound conversation in
 * the brand mailbox whose reply thread is the email. Attributed to the BM via
 * `user`, assigned to them, and left ACTIVE so it sits in their inbox as a
 * live thread (Nicola, 28 Aug — closed threads were invisible). Throws on
 * failure — the caller decides how loud to be.
 */
export async function sendCustomerEmail(input: HelpscoutEmailInput): Promise<string | null> {
  if (!helpscoutConfigured()) throw new Error("Help Scout is not configured");
  const token = await helpscoutToken();
  const userId = input.sentByUserId ? Number(input.sentByUserId) : undefined;
  const response = await fetch("https://api.helpscout.net/v2/conversations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.subject,
      mailboxId: Number(input.mailboxId),
      type: "email",
      status: "active",
      tags: ["calltime-auto"],
      customer: guestCustomer(input.guestName, input.guestEmail),
      ...(userId ? { user: userId, assignTo: userId } : {}),
      threads: [
        {
          type: "reply",
          customer: { email: input.guestEmail },
          text: input.bodyHtml,
          ...(userId ? { user: userId } : {}),
          ...(input.ics
            ? {
                attachments: [
                  {
                    fileName: input.ics.filename,
                    mimeType: "text/calendar",
                    data: Buffer.from(input.ics.content).toString("base64"),
                  },
                ],
              }
            : {}),
        },
        ...(input.internalNote ? [{ type: "note", text: input.internalNote }] : []),
      ],
    }),
  });
  if (response.status !== 201) {
    const text = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Help Scout email failed (${response.status}) ${text}`);
  }
  return response.headers.get("Resource-ID") ?? response.headers.get("Location")?.split("/").pop() ?? null;
}
