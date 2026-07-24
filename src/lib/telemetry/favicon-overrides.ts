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
  if (!isNestApplication(application)) return null;

  return {
    bytes: new TextEncoder().encode(THE_NEST_ICON),
    contentType: "image/svg+xml",
  };
}
