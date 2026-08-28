// The single typed variable registry. The template editor, the preview and
// the renderer all import THIS, so they can never disagree about what a
// variable means or whether it exists.

export type VariableDef = {
  label: string;
  sample: string;
};

export const VARIABLES = {
  guest: {
    first_name: { label: "First name", sample: "Susan" },
    full_name: { label: "Full name", sample: "Susan Whitfield" },
    email: { label: "Email", sample: "susan@example.com" },
  },
  booking: {
    meeting_date: { label: "Date", sample: "Tuesday 18 August" },
    meeting_time: { label: "Time", sample: "2:30pm" },
    timezone: { label: "Timezone", sample: "AEST" },
    duration: { label: "Duration", sample: "30 minutes" },
    meet_link: { label: "Join link", sample: "https://meet.google.com/abc-defg-hij" },
    join_details: {
      label: "Join details (video link, or phone line for voice calls)",
      sample: 'When it\'s time, join here: <a href="https://meet.google.com/abc-defg-hij">https://meet.google.com/abc-defg-hij</a>',
    },
    reschedule_link: { label: "Reschedule link", sample: "https://cove.leatherbacktravel.com/manage/sample" },
    cancel_link: { label: "Cancel link", sample: "https://cove.leatherbacktravel.com/manage/sample#cancel" },
    book_link: { label: "Book-again link (same BM, same call type)", sample: "https://cove.leatherbacktravel.com/book?bm=lisa-hartley&type=enquiry" },
  },
  host: {
    first_name: { label: "BM first name", sample: "Lisa" },
    full_name: { label: "BM full name", sample: "Lisa Hartley" },
    email: { label: "BM email", sample: "lisa@patchadventures.com.au" },
    photo: { label: "BM photo", sample: "https://cove.leatherbacktravel.com/images/sample-bm.jpg" },
    bio: { label: "BM bio", sample: "Lisa has led trips across four continents." },
  },
  brand: {
    name: { label: "Brand name", sample: "Patch Adventures" },
    logo: { label: "Brand logo", sample: "https://cove.leatherbacktravel.com/images/sample-logo.svg" },
    phone: { label: "Support phone (geo-aware)", sample: "1300 123 456" },
  },
  trip: {
    name: { label: "Trip name", sample: "Bengal to Bhutan 15 Days 2026" },
    url: { label: "Trip page", sample: "https://patchadventures.com.au/tour/15-day-bengal-to-bhutan-adventure/" },
    departure_date: { label: "Departure", sample: "3 March 2026" },
  },
} as const satisfies Record<string, Record<string, VariableDef>>;

export type VariableName = {
  [Group in keyof typeof VARIABLES]: `${Group & string}.${keyof (typeof VARIABLES)[Group] & string}`;
}[keyof typeof VARIABLES];

export function allVariableNames(): VariableName[] {
  const names: string[] = [];
  for (const [group, defs] of Object.entries(VARIABLES)) {
    for (const key of Object.keys(defs)) names.push(`${group}.${key}`);
  }
  return names as VariableName[];
}

export function isKnownVariable(name: string): name is VariableName {
  const [group, key] = name.split(".");
  if (!group || !key) return false;
  const defs = (VARIABLES as Record<string, Record<string, VariableDef>>)[group];
  return Boolean(defs && defs[key]);
}

export function sampleValues(): Record<VariableName, string> {
  const out: Record<string, string> = {};
  for (const [group, defs] of Object.entries(VARIABLES)) {
    for (const [key, def] of Object.entries(defs)) out[`${group}.${key}`] = def.sample;
  }
  return out as Record<VariableName, string>;
}
