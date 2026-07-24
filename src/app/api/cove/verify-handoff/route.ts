import { NextResponse } from "next/server";
import {
  COVE_HANDOFF_VERIFICATION_SCHEMA,
  verifyCoveHandoffTicket,
} from "@/lib/cove-handoff/protocol";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function response(
  status: number,
  body: {
    readonly schema: typeof COVE_HANDOFF_VERIFICATION_SCHEMA;
    readonly valid: boolean;
    readonly applicationSlug?: string;
  },
) {
  return NextResponse.json(body, { status, headers });
}

async function readBoundedBody(request: Request, maximumBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maximumBytes) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function POST(request: Request) {
  const secret = process.env.COVE_HANDOFF_SECRET;
  if (!secret || secret.length < 32) {
    return response(503, {
      schema: COVE_HANDOFF_VERIFICATION_SCHEMA,
      valid: false,
    });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = Number(contentLengthHeader ?? "0");
  if (
    (contentLengthHeader !== null &&
      (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > 5_000)) ||
    !request.headers.get("content-type")?.toLowerCase().includes("application/json")
  ) {
    return response(400, {
      schema: COVE_HANDOFF_VERIFICATION_SCHEMA,
      valid: false,
    });
  }

  let body: unknown;
  try {
    const rawBody = await readBoundedBody(request, 5_000);
    if (rawBody === null) {
      return response(400, {
        schema: COVE_HANDOFF_VERIFICATION_SCHEMA,
        valid: false,
      });
    }
    body = JSON.parse(rawBody);
  } catch {
    return response(400, {
      schema: COVE_HANDOFF_VERIFICATION_SCHEMA,
      valid: false,
    });
  }

  const record =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  const claims = verifyCoveHandoffTicket({
    ticket: record.ticket,
    applicationSlug: record.applicationSlug,
    secret,
  });
  if (!claims) {
    return response(401, {
      schema: COVE_HANDOFF_VERIFICATION_SCHEMA,
      valid: false,
    });
  }

  return response(200, {
    schema: COVE_HANDOFF_VERIFICATION_SCHEMA,
    valid: true,
    applicationSlug: claims.applicationSlug,
  });
}
