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
import { findBestMeetingSlot, suggestOmissions, type ComfortBand, type MeetingAttendee, type ScoredSlot } from "./meeting.ts";

const TEAM_DIRECTORY_DATABASE_ID = "3563b112-a0e0-80fe-8ccc-fd3667a0807f";
const GARDEN_URL = "https://cove.leatherbacktravel.com/garden";
const DEFAULT_TIMEZONE = "Australia/Sydney";

// --- Slack -----------------------------------------------------------------

export function slackConfigured(): boolean {
  return Boolean(process.env.GARDEN_SLACK_WEBHOOK_URL);
}

// Notion Location values → IANA timezones. Google Calendar settings remain
// the first source of truth; this is the fallback so nobody is ever assumed
// into the wrong hemisphere.
const LOCATION_TIMEZONES: Array<[RegExp, string]> = [
  [/melbourne|victoria/i, "Australia/Melbourne"],
  [/nsw/i, "Australia/Sydney"],
  [/qld|queensland|sunshine coast/i, "Australia/Brisbane"],
  [/tasmania/i, "Australia/Hobart"],
  [/northern territory/i, "Australia/Darwin"],
  [/serbia|belgrade/i, "Europe/Belgrade"],
  [/bulgaria|sofia|varna/i, "Europe/Sofia"],
  [/bosnia/i, "Europe/Sarajevo"],
  [/montenegro/i, "Europe/Podgorica"],
  [/croatia/i, "Europe/Zagreb"],
  [/skopje|macedonia/i, "Europe/Skopje"],
  [/bali|indonesia/i, "Asia/Makassar"],
  [/colombia/i, "America/Bogota"],
  [/mexico/i, "America/Mexico_City"],
  [/uruguay|montevideo/i, "America/Montevideo"],
  [/united states|usa/i, "America/Denver"],
];

// Corrections from the 1 Sep three-source audit (Google Calendar setting vs
// Notion Location vs Slack profile). These people's Google Calendar setting is
// materially wrong, so it must not win: Nicola confirmed Melbourne directly
// (Google says Brisbane — off by an hour once DST starts); Mandy's home is
// Victoria (Google: Adelaide; Slack: an on-leave Amsterdam); Mikaela lives in
// Bulgaria per Notion and her phone number (Google Madrid / Slack Amsterdam
// look like untouched defaults). Fix the source settings, then prune this.
const TIMEZONE_OVERRIDES = new Map<string, string>([
  ["nicola@leatherbacktravel.com", "Australia/Melbourne"],
  ["nicola@patchadventures.com.au", "Australia/Melbourne"],
  ["mandy@patchadventures.com.au", "Australia/Melbourne"],
  ["mikaela@leatherbacktravel.com", "Europe/Sofia"],
]);

export function timezoneForLocation(location: string): string | null {
  for (const [pattern, timezone] of LOCATION_TIMEZONES) {
    if (pattern.test(location)) return timezone;
  }
  return null;
}

type NotionPerson = { slackId: string | null; location: string | null };
let notionCache: { at: number; map: Map<string, NotionPerson> } | null = null;

async function notionPeople(): Promise<Map<string, NotionPerson>> {
  if (notionCache && Date.now() - notionCache.at < 10 * 60 * 1000) return notionCache.map;
  const token = process.env.NOTION_TOKEN;
  const map = new Map<string, NotionPerson>();
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
        results?: Array<{
          properties?: Record<string, { email?: string; select?: { name?: string }; rich_text?: Array<{ plain_text?: string }> }>;
        }>;
        has_more?: boolean;
        next_cursor?: string;
      };
      for (const page of payload.results ?? []) {
        const props = page.properties ?? {};
        const email = (props.Email?.email ?? props.Email?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "")
          .trim()
          .toLowerCase();
        if (!email) continue;
        const slack = (props["Slack ID"]?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "").trim();
        const location = props.Location?.select?.name ?? props.Location?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? null;
        map.set(email, { slackId: /^U[A-Z0-9]{8,}$/.test(slack) ? slack : null, location: location || null });
      }
      cursor = payload.has_more ? payload.next_cursor : undefined;
    } while (cursor);
    notionCache = { at: Date.now(), map };
  } catch (error) {
    console.error("garden notion directory lookup failed", error);
  }
  return map;
}

/** email (lowercased) → Slack member ID, from the Notion team directory. */
export async function slackIdsByEmail(): Promise<Map<string, string>> {
  const people = await notionPeople();
  const map = new Map<string, string>();
  for (const [email, person] of people) if (person.slackId) map.set(email, person.slackId);
  return map;
}

/** email → IANA timezone derived from the Notion Location field, with the
 * audit corrections applied on top. */
export async function timezonesByEmail(): Promise<Map<string, string>> {
  const people = await notionPeople();
  const map = new Map<string, string>();
  for (const [email, person] of people) {
    const timezone = person.location ? timezoneForLocation(person.location) : null;
    if (timezone) map.set(email, timezone);
  }
  for (const [email, timezone] of TIMEZONE_OVERRIDES) map.set(email, timezone);
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

export type ProposalAttendee = { name: string; email: string; timezone: string; band: ComfortBand };

export type ProposalOption = {
  omitName: string | null;
  omitEmail: string | null;
  startIso: string;
  endIso: string;
  attendees: ProposalAttendee[];
};

export type MeetingProposal = {
  /** First option = the whole group where a slot exists; then omissions. */
  options: ProposalOption[];
  skipped: string[];
  demo: boolean;
};

export function meetingConfigured(): boolean {
  return calendarConfigured();
}

async function primaryTimezone(email: string, notionFallback: Map<string, string>): Promise<string> {
  const override = TIMEZONE_OVERRIDES.get(email);
  if (override) return override;
  try {
    const token = await accessTokenFor(email);
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = (await response.json()) as { timeZone?: string };
      if (body.timeZone) return body.timeZone;
    }
  } catch {
    // fall through to the directory location
  }
  return notionFallback.get(email) ?? DEFAULT_TIMEZONE;
}

export async function proposeMeeting(
  viewerEmail: string | null,
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
  // The free/busy query impersonates the viewer; when the viewer has no
  // tenant identity (preview mode), impersonate the first attendee instead.
  let subject = viewerEmail ?? emails[0].email;
  let busyResult;
  try {
    busyResult = await freeBusy(subject, emails.map((entry) => entry.email), timeMin, timeMax);
  } catch (error) {
    if (subject !== emails[0].email) {
      subject = emails[0].email;
      busyResult = await freeBusy(subject, emails.map((entry) => entry.email), timeMin, timeMax);
    } else {
      throw error;
    }
  }
  const { busyByEmail, unreachable } = busyResult;

  const notionFallback = await timezonesByEmail();
  const attendees: MeetingAttendee[] = [];
  const withTimezone: Array<{ name: string; email: string; timezone: string }> = [];
  for (const entry of emails) {
    if (unreachable.includes(entry.email)) {
      skipped.push(`${entry.name} (calendar unreachable)`);
      continue;
    }
    const timezone = await primaryTimezone(entry.email, notionFallback);
    attendees.push({ email: entry.email, timezone, busy: busyByEmail.get(entry.email) ?? [] });
    withTimezone.push({ name: entry.name, email: entry.email, timezone });
  }
  if (attendees.length === 0) return { error: "None of the project team's calendars were reachable." };

  const nameByEmail = new Map(withTimezone.map((entry) => [entry.email, entry.name]));
  const tzByEmail = new Map(withTimezone.map((entry) => [entry.email, entry.timezone]));
  const toOption = (slot: ScoredSlot, omitEmail: string | null): ProposalOption => ({
    omitName: omitEmail ? (nameByEmail.get(omitEmail) ?? omitEmail) : null,
    omitEmail,
    startIso: slot.startIso,
    endIso: slot.endIso,
    attendees: slot.perAttendee.map((entry) => ({
      name: nameByEmail.get(entry.email) ?? entry.email,
      email: entry.email,
      timezone: tzByEmail.get(entry.email) ?? DEFAULT_TIMEZONE,
      band: entry.band,
    })),
  });

  // Start looking from two hours out so nobody gets ambushed. Comfort beats
  // soonness: a fully in-hours slot wins even when a stretched one is sooner.
  const search = {
    fromIso: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    horizonDays: 7,
    durationMinutes: 30,
  };
  const full = findBestMeetingSlot({ ...search, attendees });
  const options: ProposalOption[] = full ? [toOption(full, null)] : [];

  // When the whole group can only meet at a stretch (or not at all), work out
  // who could sit this one out for a better time.
  if (!full || full.tier > 0) {
    for (const omission of suggestOmissions({ ...search, attendees, fullGroupSlot: full })) {
      options.push(toOption(omission.slot, omission.omitEmail));
    }
  }
  if (options.length === 0) {
    return { error: "No 30-minute slot in the next week works, even leaving one person out. Try again next week or trim the team by hand." };
  }
  return { proposal: { options, skipped, demo: false } };
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
