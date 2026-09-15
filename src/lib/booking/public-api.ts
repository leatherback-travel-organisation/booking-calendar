// Shared plumbing for the anonymous guest-facing endpoints.

import "server-only";

import { getSql } from "./db";
import type { Brand } from "./model";

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

/** Geo-aware support phone (§11.3): Vercel's edge country header, no lookups. */
export function supportPhone(brand: Brand, request: Request): string | null {
  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();
  if (country === "AU") return brand.phoneAu ?? brand.phoneDefault;
  if (country === "NZ") return brand.phoneNz ?? brand.phoneAu ?? brand.phoneDefault;
  return brand.phoneDefault ?? brand.phoneAu;
}

/**
 * Cloudflare Turnstile server-side verification. Fails OPEN only when no
 * secret is configured (dev/preview); with a secret set, no token = no pass.
 */
export async function verifyTurnstile(token: string | null, remoteIp: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    const body = (await response.json()) as { success?: boolean };
    return Boolean(body.success);
  } catch {
    return false;
  }
}

/** The honeypot field is CSS-hidden, not type=hidden — bots fill it, humans can't. */
export function honeypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/**
 * Fixed-window rate limit backed by Postgres (serverless-safe — in-memory
 * counters reset on every cold start). Returns true when the caller is over
 * the limit. Fails open on database errors: availability beats strictness
 * for guests, and the exclusion constraint still protects correctness.
 */
export async function rateLimited(
  kind: string,
  principal: string | null,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!principal) return false;
  const key = `${kind}:${principal.toLowerCase()}`.slice(0, 200);
  try {
    const sql = getSql();
    const rows = await sql`
      insert into booking.rate_limit (key, window_start, count)
      values (${key}, now(), 1)
      on conflict (key) do update set
        count = case
          when booking.rate_limit.window_start < now() - make_interval(secs => ${windowSeconds}) then 1
          else booking.rate_limit.count + 1
        end,
        window_start = case
          when booking.rate_limit.window_start < now() - make_interval(secs => ${windowSeconds}) then now()
          else booking.rate_limit.window_start
        end
      returning count`;
    return Number(rows[0].count) > limit;
  } catch {
    return false;
  }
}

export { appUrl } from "./app-url";
