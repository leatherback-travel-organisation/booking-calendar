// Shared domain types for the booking app. Database rows live in the
// `booking` Postgres schema; reference data is read-only from Airtable/Notion.

export type Brand = {
  id: string;
  key: string;
  name: string;
  aliases: string[];
  logoUrl: string | null;
  colorPrimary: string | null;
  colorAccent: string | null;
  schedulingTimezone: string;
  market: "AU" | "US";
  phoneAu: string | null;
  phoneNz: string | null;
  phoneDefault: string | null;
  helpscoutMailboxId: string | null;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  /**
   * Guest reminder settings, owned by the brand and edited only by Pod Leads
   * and Senior BMs (Guest Communications). Confirmations, reschedules and
   * cancellations always send — these govern reminders only.
   */
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  /** Bookings with a guest phone also get SMS reminders when true. */
  smsRemindersEnabled: boolean;
  active: boolean;
};

export type Staff = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  slug: string;
  primaryBrandId: string | null;
  /** Every brand pool this BM serves, backups included. */
  brandIds: string[];
  /** The subset of brandIds held as backup only (not their displayed brand). */
  backupBrandIds: string[];
  timezoneOverride: string | null;
  bio: string | null;
  photoUrl: string | null;
  helpscoutUserId: string | null;
  aircallUserId: string | null;
  slackUserId: string | null;
  airtableRecordId: string | null;
  bufferMinutes: number;
  minNoticeHours: number;
  bookingWindowDays: number;
  /** Guests may choose a video call only when true; otherwise phone-only. */
  videoCallsEnabled: boolean;
  /** Synced from Notion's Job Title. */
  jobTitle: string | null;
  /** Senior Booking Manager — may edit Guest Communications (with Pod Leads). */
  isSenior: boolean;
  active: boolean;
  calendarOk: boolean;
};

/** "Senior Booking Manager" in Notion grants comms editing; matched loosely. */
export function isSeniorTitle(jobTitle: string | null): boolean {
  return /senior booking manager/i.test(jobTitle ?? "");
}

/** day_of_week: 0 = Sunday. Minutes from midnight in the scheduling zone. */
export type WorkingHours = {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
};

export type EventType = {
  id: string;
  brandId: string;
  key: string;
  name: string;
  description: string | null;
  durationMin: number;
  guestFacing: boolean;
  supportsGroup: boolean;
  locationKind: "google_meet" | "phone";
  active: boolean;
  position: number;
};

/** A single Airtable trip departure, as cached by the reference sync. */
export type Departure = {
  airtableId: string;
  titleAndCode: string;
  tripName: string;
  niceName: string | null;
  brandName: string | null;
  status: string | null;
  startDate: string | null; // ISO date
  websiteUrl: string | null;
  /** Parsed from websiteUrl at sync time. */
  host: string | null;
  slug: string | null;
  /** Airtable "Countries Visited" / "Regions Visited" lookups — trip search matches these. */
  countries: string[];
  regions: string[];
  coordinatorAirtableIds: string[];
  coordinatorEmails: string[];
};

/** Half-open UTC interval [start, end) as ISO strings with offset. */
export type Interval = {
  start: string;
  end: string;
};

export type Slot = Interval;
