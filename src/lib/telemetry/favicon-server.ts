import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  extractFaviconUrls,
  isPrivateNetworkAddress,
  obviousUnsafeFaviconHost,
  sniffFaviconContentType,
} from "./favicon-model";

const HTML_LIMIT = 512 * 1024;
const ICON_LIMIT = 128 * 1024;
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;

export type DownloadedFavicon = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
};

async function assertPublicHttpsTarget(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || obviousUnsafeFaviconHost(url.hostname)) {
    throw new Error("Favicon targets must be public credential-free HTTPS URLs.");
  }

  if (isIP(url.hostname)) {
    if (isPrivateNetworkAddress(url.hostname)) throw new Error("Private network targets are unavailable.");
    return url;
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error("Private network targets are unavailable.");
  }
  return url;
}

async function publicFetch(value: string, accept: string, originalHostname?: string): Promise<Response> {
  let target = await assertPublicHttpsTarget(value);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (originalHostname && target.hostname !== originalHostname) throw new Error("Application pages cannot redirect to another host during favicon discovery.");
    const response = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: accept,
        "User-Agent": "Cove-Favicon-Discovery/1.0",
      },
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirect === MAX_REDIRECTS) throw new Error("Favicon discovery exceeded its redirect limit.");
    target = await assertPublicHttpsTarget(new URL(location, target).toString());
  }

  throw new Error("Favicon discovery failed.");
}

async function readLimited(response: Response, limit: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new Error("Favicon response is too large.");
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new Error("Favicon response is too large.");
    }
    chunks.push(value);
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function downloadIcon(iconUrl: string): Promise<DownloadedFavicon | null> {
  try {
    const response = await publicFetch(iconUrl, "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.1");
    if (!response.ok) return null;
    const bytes = await readLimited(response, ICON_LIMIT);
    const contentType = sniffFaviconContentType(bytes);
    return contentType ? { bytes, contentType } : null;
  } catch {
    return null;
  }
}

export async function downloadApplicationFavicon(launchUrl: string): Promise<DownloadedFavicon | null> {
  const applicationUrl = await assertPublicHttpsTarget(launchUrl);
  const candidates: string[] = [];

  try {
    const page = await publicFetch(applicationUrl.toString(), "text/html,application/xhtml+xml", applicationUrl.hostname);
    if (page.ok && (page.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
      const html = new TextDecoder().decode(await readLimited(page, HTML_LIMIT));
      candidates.push(...extractFaviconUrls(html, applicationUrl.toString()));
    }
  } catch {
    // Protected application pages often reject service requests; the standard
    // origin favicon remains a useful and safe fallback.
  }

  // Frameworks do not agree on one conventional icon path. Next.js App Router,
  // for example, publishes app/icon.png as /icon.png and app/apple-icon.png as
  // /apple-icon.png even when a protected page cannot be inspected for <link>s.
  for (const pathname of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/favicon.png", "/favicon.svg"]) {
    candidates.push(new URL(pathname, applicationUrl.origin).toString());
  }
  for (const candidate of [...new Set(candidates)]) {
    const icon = await downloadIcon(candidate);
    if (icon) return icon;
  }
  return null;
}
