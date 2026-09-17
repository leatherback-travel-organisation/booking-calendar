// Google Calendar REST client over domain-wide delegation. Read side uses
// freebusy.query (one call, up to 50 calendars); write side creates, patches
// and deletes events on the impersonated BM's primary calendar.

import "server-only";

import { accessTokenFor, GoogleDelegationError } from "./auth";
import type { Interval } from "../model";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {
  readonly status: number;
  readonly kind: "not_in_tenant" | "rate_limited" | "delegation" | "api_error";
  readonly detail?: string;

  constructor(
    message: string,
    status: number,
    kind: "not_in_tenant" | "rate_limited" | "delegation" | "api_error",
    detail?: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

async function calendarFetch(
  subjectEmail: string,
  path: string,
  init: RequestInit & { retries?: number } = {},
): Promise<Response> {
  const { retries = 3, ...rest } = init;
  const token = await accessTokenFor(subjectEmail);
  let attempt = 0;
  for (;;) {
    const response = await fetch(`${CALENDAR_API}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(rest.headers ?? {}),
      },
    });
    if (response.status === 403 || response.status === 429) {
      const body = await response.clone().text();
      const rateLimited = response.status === 429 || /rateLimitExceeded|userRateLimitExceeded/.test(body);
      if (rateLimited && attempt < retries) {
        // Exponential backoff with jitter; never hammer.
        const delayMs = Math.min(8000, 400 * 2 ** attempt) + Math.random() * 250;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        attempt += 1;
        continue;
      }
      if (rateLimited) {
        throw new GoogleCalendarError("Google Calendar rate limit exceeded.", response.status, "rate_limited", body.slice(0, 500));
      }
    }
    return response;
  }
}

/**
 * One freebusy.query for up to 50 calendars, impersonating `subjectEmail`.
 * Returns UTC intervals per (lowercased) email. Calendars Google reports as
 * errored come back in `unreachable` — callers surface those on the coverage
 * map instead of treating them as "free all week".
 */
export async function freeBusy(
  subjectEmail: string,
  calendarEmails: string[],
  timeMinIso: string,
  timeMaxIso: string,
): Promise<{ busyByEmail: Map<string, Interval[]>; unreachable: string[] }> {
  if (calendarEmails.length === 0) return { busyByEmail: new Map(), unreachable: [] };
  if (calendarEmails.length > 50) {
    throw new GoogleCalendarError("freebusy.query accepts at most 50 calendars per request.", 400, "api_error");
  }
  const response = await calendarFetch(subjectEmail, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: calendarEmails.map((id) => ({ id })),
    }),
  });
  if (response.status === 404) {
    throw new GoogleCalendarError(`${subjectEmail} is not in the Workspace tenant.`, 404, "not_in_tenant");
  }
  if (!response.ok) {
    throw new GoogleCalendarError(`freebusy.query failed (${response.status}).`, response.status, "api_error", (await response.text()).slice(0, 500));
  }
  const body = (await response.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }>;
  };
  const busyByEmail = new Map<string, Interval[]>();
  const unreachable: string[] = [];
  for (const email of calendarEmails) {
    const entry = body.calendars?.[email] ?? body.calendars?.[email.toLowerCase()];
    if (!entry || (entry.errors && entry.errors.length > 0)) {
      unreachable.push(email.toLowerCase());
      continue;
    }
    busyByEmail.set(
      email.toLowerCase(),
      (entry.busy ?? []).map((b) => ({ start: b.start, end: b.end })),
    );
  }
  return { busyByEmail, unreachable };
}

export type CalendarEventInput = {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  timezone: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: "accepted" | "needsAction" }>;
  /** Set to create a Meet link; use the booking id so retries are idempotent. */
  conferenceRequestId?: string;
  privateProperties?: Record<string, string>;
};

export type CalendarEvent = {
  id: string;
  iCalUID: string | null;
  meetUrl: string | null;
};

function eventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: input.timezone },
    end: { dateTime: input.endIso, timeZone: input.timezone },
    ...(input.attendees ? { attendees: input.attendees } : {}),
    ...(input.conferenceRequestId
      ? {
          conferenceData: {
            createRequest: {
              requestId: input.conferenceRequestId,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
    ...(input.privateProperties ? { extendedProperties: { private: input.privateProperties } } : {}),
  };
}

function parseEvent(body: Record<string, unknown>): CalendarEvent {
  const conference = body.conferenceData as { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } | undefined;
  const meet = conference?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri
    ?? (body.hangoutLink as string | undefined);
  return {
    id: String(body.id),
    iCalUID: (body.iCalUID as string | undefined) ?? null,
    meetUrl: meet ?? null,
  };
}

/**
 * Guests get the branded email + .ics, never Google's invite. `actorEmail`
 * is who the app acts as; `calendarId` is where the event goes — the BM's
 * own primary (legacy) or the shared CallTime Cal, with the BM as an
 * accepted attendee so it still marks them busy.
 */
export async function insertEvent(
  actorEmail: string,
  input: CalendarEventInput,
  calendarId = "primary",
): Promise<CalendarEvent> {
  const response = await calendarFetch(
    actorEmail,
    `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
    { method: "POST", body: JSON.stringify(eventBody(input)) },
  );
  if (!response.ok) {
    throw await asCalendarError("events.insert", actorEmail, response);
  }
  return parseEvent((await response.json()) as Record<string, unknown>);
}

export async function patchEvent(
  actorEmail: string,
  eventId: string,
  patch: Partial<Pick<CalendarEventInput, "startIso" | "endIso" | "timezone" | "summary" | "description" | "attendees">>,
  calendarId = "primary",
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {};
  if (patch.summary) body.summary = patch.summary;
  if (patch.description) body.description = patch.description;
  if (patch.startIso) body.start = { dateTime: patch.startIso, timeZone: patch.timezone };
  if (patch.endIso) body.end = { dateTime: patch.endIso, timeZone: patch.timezone };
  if (patch.attendees) body.attendees = patch.attendees;
  const response = await calendarFetch(
    actorEmail,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=none`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  if (!response.ok) {
    throw await asCalendarError("events.patch", actorEmail, response);
  }
  return parseEvent((await response.json()) as Record<string, unknown>);
}

export async function deleteEvent(actorEmail: string, eventId: string, calendarId = "primary"): Promise<void> {
  const response = await calendarFetch(
    actorEmail,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE" },
  );
  // 404/410 mean it is already gone — that is the state we wanted.
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw await asCalendarError("events.delete", actorEmail, response);
  }
}

/** Can `actorEmail` see and write to this calendar? For the CallTime Cal setup check. */
export async function probeCalendar(
  actorEmail: string,
  calendarId: string,
): Promise<{ ok: boolean; name?: string; role?: string; error?: string }> {
  try {
    const response = await calendarFetch(
      actorEmail,
      `/users/me/calendarList/${encodeURIComponent(calendarId)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      return { ok: false, error: `Google answered ${response.status}: ${(await response.text()).slice(0, 200)}` };
    }
    const body = (await response.json()) as { summary?: string; accessRole?: string };
    const role = body.accessRole ?? "";
    const writable = role === "owner" || role === "writer";
    return {
      ok: writable,
      name: body.summary,
      role,
      error: writable ? undefined : `${actorEmail} can only "${role}" this calendar; it needs "Make changes to events".`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}

/** Cheap per-BM health probe for the Integrations page and coverage map. */
export async function checkCalendarAccess(bmEmail: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const nowIso = new Date().toISOString();
    await freeBusy(bmEmail, [bmEmail], nowIso, new Date(Date.now() + 3600_000).toISOString());
    return { ok: true };
  } catch (error) {
    if (error instanceof GoogleDelegationError || error instanceof GoogleCalendarError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

async function asCalendarError(op: string, bmEmail: string, response: Response): Promise<GoogleCalendarError> {
  const text = (await response.text()).slice(0, 500);
  if (response.status === 404) {
    return new GoogleCalendarError(`${op}: ${bmEmail} is not in the Workspace tenant.`, 404, "not_in_tenant", text);
  }
  return new GoogleCalendarError(`${op} failed for ${bmEmail} (${response.status}).`, response.status, "api_error", text);
}
