import "server-only";

// Attention-item actions: Slack notification with real @-mentions (Slack IDs
// come from the Notion team directory) and provisional 30-minute meetings
// found against everyone's Google Calendar free/busy, in their own timezones,
// via the CallTime service account's domain-wide delegation.

import { randomUUID } from "node:crypto";
import { accessTokenFor, calendarConfigured } from "@/lib/booking/google/auth";
import { freeBusy } from "@/lib/booking/google/calendar";
import { involvedPeople, personKey, stalenessFlag, type GardenProject, type PersonRef } from "./model.ts";
import { scorePair } from "./overlaps.ts";
import { findMeetingSlot, type MeetingAttendee } from "./meeting.ts";

const TEAM_DIRECTORY_DATABASE_ID = "3563b112-a0e0-80fe-8ccc-fd3667a0807f";
const GARDEN_URL = "https://cove.leatherbacktravel.com/garden";
const DEFAULT_TIMEZONE = "Australia/Sydney";

// --- Slack -----------------------------------------------------------------

export function slackConfigured(): boolean {
  return Boolean(process.env.GARDEN_SLACK_WEBHOOK_URL);
}

let slackMapCache: { at: number; map: Map<string, string> } | null = null;

/** email (lowercased) → Slack member ID, from the Notion team directory. */
export async function slackIdsByEmail(): Promise<Map<string, string>> {
  if (slackMapCache && Date.now() - slackMapCache.at < 10 * 60 * 1000) return slackMapCache.map;
  const token = process.env.NOTION_TOKEN;
  const map = new Map<string, string>();
  if (!token) return map;
  try {
    let cursor: string | undefined;
    do {
      const response = await fetch(`https://api.notion.com/v1/databases/${TEAM_DIRECTORY_DATABASE_ID}/query`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "Notion-Version": "2022-06-28",
          "content-type": "application/json",
        },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return map;
      const payload = (await response.json()) as {
        results?: Array<{ properties?: Record<string, { email?: string; rich_text?: Array<{ plain_text?: string }> }> }>;
        has_more?: boolean;
        next_cursor?: string;
      };
      for (const page of payload.results ?? []) {
        const props = page.properties ?? {};
        const email = (props.Email?.email ?? props.Email?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "")
          .trim()
          .toLowerCase();
        const slack = (props["Slack ID"]?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "").trim();
        if (email && /^U[A-Z0-9]{8,}$/.test(slack)) map.set(email, slack);
      }
      cursor = payload.has_more ? payload.next_cursor : undefined;
    } while (cursor);
    slackMapCache = { at: Date.now(), map };
  } catch (error) {
    console.error("garden slack-id lookup failed", error);
  }
  return map;
}

export function mention(person: PersonRef, slackIds: Map<string, string>): string {
  const id = person.email ? slackIds.get(person.email.trim().toLowerCase()) : undefined;
  return id ? `<@${id}>` : person.name;
}

export async function postGardenSlack(text: string): Promise<boolean> {
  const webhook = process.env.GARDEN_SLACK_WEBHOOK_URL;
  if (!webhook) return false;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}

// --- Attention item resolution ---------------------------------------------

export type ResolvedAttentionItem = {
  key: string;
  title: string;
  reasons: string[];
  people: PersonRef[];
  projects: GardenProject[];
};

function dedupe(people: PersonRef[]): PersonRef[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = personKey(person);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveAttentionItem(
  kind: "overlap" | "testing" | "stale",
  projects: GardenProject[],
  subject: string | undefined,
  now: Date,
): ResolvedAttentionItem | null {
  if (projects.length === 0) return null;
  const people = dedupe(projects.flatMap((project) => involvedPeople(project)));
  const names = projects.map((project) => project.name);

  if (kind === "overlap" && projects.length === 2) {
    const { score, reasons } = scorePair(projects[0], projects[1]);
    if (score === 0) return null;
    return {
      key: "",
      title: `Possible overlap: ${names[0]} ↔ ${names[1]}`,
      reasons,
      people,
      projects,
    };
  }
  if (kind === "testing") {
    return {
      key: "",
      title: `Testing overlap — ${subject ?? "the same testers"} across ${names.join(" and ")}`,
      reasons: [`${subject ?? "The same testers"} are assigned to testing on ${names.join(" and ")} at the same time`],
      people,
      projects,
    };
  }
  if (kind === "stale") {
    const flag = stalenessFlag(projects[0], now);
    return {
      key: "",
      title: `${names[0]} could use an update`,
      reasons: [
        flag === "overdue"
          ? `${names[0]} passed its estimated completion without an update`
          : `${names[0]} hasn't been updated in a while`,
      ],
      people,
      projects,
    };
  }
  return null;
}

export function attentionSlackMessage(item: ResolvedAttentionItem, slackIds: Map<string, string>, sentBy: string): string {
  return [
    `:seedling: *The Garden — ${item.title}*`,
    ...item.reasons.map((reason) => `• ${reason}`),
    `Project team: ${item.people.map((person) => mention(person, slackIds)).join(", ")}`,
    `Flagged by ${sentBy} · <${GARDEN_URL}|Open The Garden>`,
  ].join("\n");
}

// --- Meeting proposal -------------------------------------------------------

export type MeetingProposal = {
  startIso: string;
  endIso: string;
  attendees: Array<{ name: string; email: string; timezone: string }>;
  skipped: string[];
  demo: boolean;
};

export function meetingConfigured(): boolean {
  return calendarConfigured();
}

async function primaryTimezone(email: string): Promise<string> {
  try {
    const token = await accessTokenFor(email);
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return DEFAULT_TIMEZONE;
    const body = (await response.json()) as { timeZone?: string };
    return body.timeZone ?? DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export async function proposeMeeting(
  viewerEmail: string,
  people: PersonRef[],
  now: Date,
): Promise<{ proposal: MeetingProposal } | { error: string }> {
  const emails = dedupe(people)
    .filter((person) => person.email)
    .map((person) => ({ name: person.name, email: person.email!.trim().toLowerCase() }));
  const skipped = dedupe(people)
    .filter((person) => !person.email)
    .map((person) => person.name);
  if (emails.length === 0) return { error: "No project team members have a directory email to invite." };

  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { busyByEmail, unreachable } = await freeBusy(
    viewerEmail,
    emails.map((entry) => entry.email),
    timeMin,
    timeMax,
  );

  const attendees: MeetingAttendee[] = [];
  const withTimezone: Array<{ name: string; email: string; timezone: string }> = [];
  for (const entry of emails) {
    if (unreachable.includes(entry.email)) {
      skipped.push(`${entry.name} (calendar unreachable)`);
      continue;
    }
    const timezone = await primaryTimezone(entry.email);
    attendees.push({ email: entry.email, timezone, busy: busyByEmail.get(entry.email) ?? [] });
    withTimezone.push({ name: entry.name, email: entry.email, timezone });
  }
  if (attendees.length === 0) return { error: "None of the project team's calendars were reachable." };

  // Start looking from two hours out so nobody gets ambushed.
  const slot = findMeetingSlot({
    fromIso: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    horizonDays: 7,
    durationMinutes: 30,
    attendees,
  });
  if (!slot) {
    return { error: "No 30-minute slot in the next week fits everyone's working hours. Try trimming the invite list." };
  }
  return {
    proposal: { startIso: slot.startIso, endIso: slot.endIso, attendees: withTimezone, skipped, demo: false },
  };
}

export async function createMeeting(
  organiserEmail: string,
  title: string,
  description: string,
  startIso: string,
  endIso: string,
  attendees: Array<{ name: string; email: string }>,
): Promise<{ meetUrl: string | null } | { error: string }> {
  try {
    const token = await accessTokenFor(organiserEmail);
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          summary: title,
          description,
          start: { dateTime: startIso },
          end: { dateTime: endIso },
          attendees: attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
          conferenceData: {
            createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      console.error("garden meeting insert failed", response.status, (await response.text()).slice(0, 300));
      return { error: `Google Calendar declined the invite (${response.status}).` };
    }
    const body = (await response.json()) as {
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    };
    const meetUrl =
      body.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ??
      body.hangoutLink ??
      null;
    return { meetUrl };
  } catch (error) {
    console.error("garden meeting creation failed", error);
    return { error: "Creating the calendar invite failed — nothing was sent." };
  }
}
