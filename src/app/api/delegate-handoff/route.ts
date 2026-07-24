import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { databaseConfigured } from "@/lib/db/neon";
import { newSessionToken, tokenHash, tokensEqual } from "@/lib/delegate-handoff/crypto";
import {
  DELEGATE_HANDOFF_PROTOCOL,
  bearerToken,
  delegateActivationSchema,
  delegateDirectory,
  delegateMessageSchema,
} from "@/lib/delegate-handoff/model";
import {
  activateDelegateSession,
  addDelegateInboundMessage,
  findDelegateSessionByTokenHash,
  listDelegateOutboundMessages,
} from "@/lib/delegate-handoff/postgres";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    { protocol: DELEGATE_HANDOFF_PROTOCOL, ...body },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function unavailable() {
  return response({ error: "Delegate handoff is not configured." }, 503);
}

export async function POST(request: NextRequest) {
  if (!databaseConfigured() || !process.env.COVE_DELEGATE_BOOTSTRAP_TOKEN) return unavailable();
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("action" in body)) {
      return response({ error: "A supported handoff action is required." }, 400);
    }

    if (body.action === "activate") {
      const bootstrap = bearerToken(request.headers.get("authorization"));
      if (!tokensEqual(bootstrap, process.env.COVE_DELEGATE_BOOTSTRAP_TOKEN)) {
        return response({ error: "Delegate activation is denied." }, 401);
      }
      const value = delegateActivationSchema.parse(body);
      const sessionToken = newSessionToken();
      const session = await activateDelegateSession({
        email: value.email,
        name: delegateDirectory[value.email],
        tokenHash: tokenHash(sessionToken),
        message: value.message,
      });
      return response({
        status: session.state,
        delegate: { name: session.delegate_name, email: session.delegate_email },
        sessionToken,
        expiresAt: session.expires_at,
        pollAfterSeconds: 10,
      }, 201);
    }

    if (body.action === "message") {
      const value = delegateMessageSchema.parse(body);
      const sessionToken = bearerToken(request.headers.get("authorization"));
      const session = sessionToken
        ? await findDelegateSessionByTokenHash(tokenHash(sessionToken))
        : null;
      if (!session) return response({ error: "Delegate session is invalid or expired." }, 401);
      await addDelegateInboundMessage(session.id, value.message);
      return response({ status: "awaiting_codex", pollAfterSeconds: 10 }, 202);
    }

    return response({ error: "A supported handoff action is required." }, 400);
  } catch (cause) {
    if (cause instanceof ZodError) return response({ error: "Delegate handoff message is invalid." }, 400);
    console.error("[delegate-handoff] post failed", cause);
    return response({ error: "Delegate handoff is temporarily unavailable." }, 503);
  }
}

export async function GET(request: NextRequest) {
  if (!databaseConfigured() || !process.env.COVE_DELEGATE_BOOTSTRAP_TOKEN) return unavailable();
  try {
    const sessionToken = bearerToken(request.headers.get("authorization"));
    const session = sessionToken
      ? await findDelegateSessionByTokenHash(tokenHash(sessionToken))
      : null;
    if (!session) return response({ error: "Delegate session is invalid or expired." }, 401);
    const rawAfter = request.nextUrl.searchParams.get("after") ?? "0";
    if (!/^\d{1,18}$/.test(rawAfter)) return response({ error: "The message cursor is invalid." }, 400);
    const messages = await listDelegateOutboundMessages(session.id, Number(rawAfter));
    return response({
      status: session.state,
      delegate: { name: session.delegate_name, email: session.delegate_email },
      messages,
      pollAfterSeconds: session.state === "access_ready" || session.state === "blocked" ? null : 10,
    });
  } catch (cause) {
    console.error("[delegate-handoff] poll failed", cause);
    return response({ error: "Delegate handoff is temporarily unavailable." }, 503);
  }
}
