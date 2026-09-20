// Server half of contact qualification: the one check that needs the
// network (does the email domain accept mail at all?) plus the ledger of
// what was refused, so the Integrations page can show the bots being
// turned away rather than leaving everyone to guess.

import "server-only";

import { promises as dns } from "node:dns";
import { getSql } from "./db";
import { clientIp } from "./public-api";
import type { ContactProblem } from "./contact-quality";

type Verdict = { ok: boolean; at: number };
const verdicts = new Map<string, Verdict>();
const VERDICT_TTL_MS = 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2500;

/**
 * True when the domain has an MX record, or (the RFC 5321 fallback) an
 * A/AAAA record. Fails OPEN on timeouts and resolver errors — a slow DNS
 * server must never cost a real guest their booking — and closed only on a
 * definite "no such name / no records" from the resolver.
 */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
  const key = domain.toLowerCase();
  const cached = verdicts.get(key);
  if (cached && Date.now() - cached.at < VERDICT_TTL_MS) return cached.ok;
  const ok = await lookup(key);
  verdicts.set(key, { ok, at: Date.now() });
  return ok;
}

async function lookup(domain: string): Promise<boolean> {
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx === "timeout") return true;
    if (mx.some((r) => r.exchange && r.exchange !== ".")) return true;
    // "Null MX" (RFC 7505: a single '.' record) means: this domain never takes mail.
    if (mx.length > 0 && mx.every((r) => r.exchange === "." || r.exchange === "")) return false;
  } catch (error) {
    if (!isDefiniteNo(error)) return true;
  }
  try {
    const a = await withTimeout(dns.resolve4(domain));
    if (a === "timeout" || a.length > 0) return true;
  } catch (error) {
    if (!isDefiniteNo(error)) return true;
  }
  try {
    const aaaa = await withTimeout(dns.resolve6(domain));
    return aaaa === "timeout" || aaaa.length > 0;
  } catch (error) {
    return !isDefiniteNo(error);
  }
}

function isDefiniteNo(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

async function withTimeout<T>(promise: Promise<T>): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One audit row per refusal — what was refused and why, never the whole payload. */
export async function recordContactRejection(
  request: Request,
  brandKey: string | null,
  problem: ContactProblem,
  sample: { email?: string; phone?: string },
): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      insert into booking.audit_log (actor, action, subject, detail)
      values ('guest', 'contact_rejected', ${brandKey ?? "unknown"},
              ${JSON.stringify({
                code: problem.code,
                emailDomain: sample.email?.split("@")[1]?.toLowerCase() ?? null,
                phonePrefix: sample.phone?.slice(0, 5) ?? null,
                ip: clientIp(request),
                country: request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? null,
                userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
              })}::jsonb)`;
  } catch {
    // Bookkeeping about a refusal must never break the refusal.
  }
}

/** Refusals in the last N days, for the Integrations page. */
export async function contactRejectionCount(days: number): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    select count(*)::int as n from booking.audit_log
    where action = 'contact_rejected' and created_at > now() - (${days} || ' days')::interval`;
  return Number(rows[0]?.n ?? 0);
}
