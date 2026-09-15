// Standards-compliant .ics payloads (METHOD:REQUEST / METHOD:CANCEL) so the
// branded email adds to Gmail, Outlook and Apple Calendar identically. The
// UID is stable per booking, which is what lets METHOD:CANCEL remove the
// event from the guest's calendar automatically.

import { DateTime } from "luxon";

export type IcsEventInput = {
  uid: string;
  /** Monotonic per UID; bump on every reschedule so clients apply the update. */
  sequence: number;
  startIso: string;
  endIso: string;
  summary: string;
  description: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  url?: string;
  location?: string;
};

function icsTimestamp(iso: string): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) throw new Error(`Invalid ISO timestamp for ics: ${iso}`);
  return dt.toFormat("yyyyMMdd'T'HHmmss'Z'");
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding at 75 octets. */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    // Do not split inside a UTF-8 sequence.
    while (end > start && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

function buildIcs(method: "REQUEST" | "CANCEL", event: IcsEventInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Leatherback Travel//Booking//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${icsTimestamp(new Date().toISOString())}`,
    `DTSTART:${icsTimestamp(event.startIso)}`,
    `DTEND:${icsTimestamp(event.endIso)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `ORGANIZER;CN=${escapeIcsText(event.organizerName)}:mailto:${event.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(event.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=${method === "CANCEL" ? "DECLINED" : "ACCEPTED"}:mailto:${event.attendeeEmail}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function icsRequest(event: IcsEventInput): string {
  return buildIcs("REQUEST", event);
}

export function icsCancel(event: IcsEventInput): string {
  return buildIcs("CANCEL", event);
}
