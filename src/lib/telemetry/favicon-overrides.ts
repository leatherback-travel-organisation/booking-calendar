type ApplicationIconIdentity = {
  readonly slug: string;
  readonly name: string;
  readonly launchUrl: string;
};

export type FaviconOverride = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
};

const THE_NEST_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#1f6f62"/>
  <ellipse cx="32" cy="24" rx="5.2" ry="7.4" fill="#ecfff8"/>
  <g fill="none" stroke="#ecfff8" stroke-width="3.2" stroke-linecap="round">
    <path d="M19 31.5c4 3.1 8.3 4.7 13 4.7s9-1.6 13-4.7"/>
    <path d="M16.8 37.1c4.8 3.7 9.9 5.6 15.2 5.6s10.4-1.9 15.2-5.6"/>
    <path d="M22 43.3c3.2 1.9 6.5 2.8 10 2.8s6.8-.9 10-2.8"/>
  </g>
</svg>`;

// Calltime: a clock face inside a speech bubble — a call, about time.
// Hot pink with a dark navy bubble and clock (Nicola, 20 Aug).
const CALLTIME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#ff4fa3"/>
  <circle cx="32" cy="28.5" r="15" fill="none" stroke="#1d283b" stroke-width="3.6"/>
  <path d="M21.5 40.5 L17 52 L31 43.2 Z" fill="#1d283b"/>
  <path d="M32 20.5 V28.5 L38.6 32.4" fill="none" stroke="#1d283b" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="28.5" r="2" fill="#1d283b"/>
</svg>`;

function isCalltimeApplication(application: ApplicationIconIdentity) {
  return application.slug === "booking" || application.name.toLowerCase() === "calltime";
}

function containsNestToken(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).includes("nest");
}

function launchUrlHasNestHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().split(".").includes("nest");
  } catch {
    return false;
  }
}

function isNestApplication(application: ApplicationIconIdentity) {
  return (
    containsNestToken(application.slug) ||
    containsNestToken(application.name) ||
    launchUrlHasNestHost(application.launchUrl)
  );
}

export function applicationFaviconOverride(application: ApplicationIconIdentity): FaviconOverride | null {
  if (isCalltimeApplication(application)) {
    return {
      bytes: new TextEncoder().encode(CALLTIME_ICON),
      contentType: "image/svg+xml",
    };
  }

  if (!isNestApplication(application)) return null;

  return {
    bytes: new TextEncoder().encode(THE_NEST_ICON),
    contentType: "image/svg+xml",
  };
}
