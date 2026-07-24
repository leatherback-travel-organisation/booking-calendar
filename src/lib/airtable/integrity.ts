import { isIsoOperationalDate } from "../integrity/date.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/i;

export type ParsedOptional<T> = T | undefined | null;

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || undefined;
}

/** Returns undefined for absent values and null for present values that are unsafe. */
export function parseSafeHttpsUrl(
  value: unknown,
  allowedHosts?: ReadonlySet<string>,
): ParsedOptional<string> {
  const text = optionalText(value);
  if (text === undefined || text === null) return text;

  try {
    const url = new URL(text);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (allowedHosts && !allowedHosts.has(hostname))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseInstagramUrl(value: unknown): ParsedOptional<string> {
  const text = optionalText(value);
  if (text === undefined || text === null) return text;

  if (!text.includes(":") && !text.includes("/")) {
    const handle = text.replace(/^@/, "");
    return INSTAGRAM_HANDLE.test(handle)
      ? `https://www.instagram.com/${handle}/`
      : null;
  }

  return parseSafeHttpsUrl(text, new Set(["instagram.com", "www.instagram.com"]));
}

export function parseSafeEmail(value: unknown): ParsedOptional<string> {
  const text = optionalText(value);
  if (text === undefined || text === null) return text;
  const email = text.toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function parseSourceDate(value: unknown): ParsedOptional<string> {
  const text = optionalText(value);
  if (text === undefined || text === null) return text;
  if (!isIsoOperationalDate(text)) return null;
  return text.slice(0, 10);
}

export function parseBirthday(value: unknown): ParsedOptional<string> {
  const date = parseSourceDate(value);
  return date ? `2000-${date.slice(5)}` : date;
}
