// Shapes of the public booking API payloads, as consumed by the guest pages.
// These mirror the JSON returned by /api/booking/public/* — keep in sync.

export type PublicBrand = {
  key: string;
  name: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorAccent: string | null;
  phone: string | null;
};

export type PublicStaff = {
  slug: string;
  firstName: string;
  bio: string | null;
  photoUrl: string | null;
};

export type PublicEventType = {
  key: string;
  name: string;
  description: string | null;
  durationMin: number;
};

export type PublicDeparture = {
  airtableId: string;
  title: string;
  startDate: string | null;
  url: string | null;
};

/** An upcoming trip of the resolved brand, for "Not the right trip?". */
export type PublicBrandTrip = {
  slug: string;
  title: string;
  startDate: string | null;
};

export type ResolvePayload =
  | { kind: "brand-picker"; brands: { key: string; name: string }[] }
  | {
      kind: "primary";
      brand: PublicBrand;
      staff: PublicStaff;
      eventTypes: PublicEventType[];
      departures: PublicDeparture[];
      brandTrips?: PublicBrandTrip[];
    }
  | {
      kind: "pool";
      brand: PublicBrand;
      poolLabel: string;
      eventTypes: PublicEventType[];
      departures: PublicDeparture[];
      brandTrips?: PublicBrandTrip[];
    };

export type PublicSlot = { start: string; end: string };

export type AvailabilityPayload = {
  staff: { slug: string; firstName: string; photoUrl: string | null };
  schedulingZone: string;
  calendarReachable: boolean;
  durationMin: number;
  slots: PublicSlot[];
  windowEnd: string;
};

export type BackupEntry = {
  staff: { slug: string; firstName: string; photoUrl: string | null; bio: string | null };
  openSlotCount: number;
  firstSlot: string | null;
};

export type BookSuccess = {
  ok: true;
  bookingId?: string;
  manageUrl?: string;
  meetUrl?: string | null;
  startIso?: string;
  endIso?: string;
};

export type BookFailure = {
  error: "slot_taken" | "calendar_failed" | "slot_invalid" | string;
  message?: string;
};

/** Default theme when a brand has no colours configured. */
export const DEFAULT_PRIMARY = "#1f3d33";
export const DEFAULT_ACCENT = "#b7791f";
