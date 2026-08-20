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
// Synthwave (Nicola, 20 Aug): indigo dusk, neon pink→cyan bubble with a
// glow, and a pink horizon grid under it.
const CALLTIME_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="ct-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b1257"/>
      <stop offset="1" stop-color="#12082b"/>
    </linearGradient>
    <linearGradient id="ct-neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff3ec8"/>
      <stop offset="1" stop-color="#3ee6ff"/>
    </linearGradient>
    <filter id="ct-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="64" height="64" rx="10" fill="url(#ct-bg)"/>
  <g stroke="#ff3ec8" stroke-width="1" opacity="0.55" fill="none">
    <path d="M5 50.5 H59"/>
    <path d="M9 56 H55"/>
    <path d="M22 47.5 L15 61"/>
    <path d="M32 47.5 V61"/>
    <path d="M42 47.5 L49 61"/>
  </g>
  <g filter="url(#ct-glow)">
    <circle cx="32" cy="26.5" r="14.5" fill="none" stroke="url(#ct-neon)" stroke-width="3.4"/>
    <path d="M22 38 L18 47.5 L30.5 41 Z" fill="#ff3ec8"/>
    <path d="M32 19 V26.5 L38.4 30.3" fill="none" stroke="#3ee6ff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
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
