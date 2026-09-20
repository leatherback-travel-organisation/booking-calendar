// Are these guest details worth booking a call for? Bots and fat fingers
// both produce addresses nobody reads and numbers nobody answers; this is
// the cheap, dependency-free line of checks that runs in the browser (for
// an inline hint) AND again on the server (which is the one that counts).
// It is deliberately lenient about anything a real guest could plausibly
// type — a false "no" here loses a real booking, a false "yes" costs a BM
// one wasted dial.

import type { DialCountry } from "@/components/booking-public/dial-codes";

export type ContactProblem = {
  /** Stable code — the API returns it as `error`, the form maps it to a field. */
  code:
    | "email_syntax"
    | "email_disposable"
    | "email_typo"
    | "email_unreachable"
    | "phone_syntax"
    | "phone_short"
    | "phone_long"
    | "phone_pattern"
    | "phone_example"
    | "name_link"
    | "notes_spam";
  /** Guest-facing sentence. */
  message: string;
  /** For email_typo only: the address we think they meant. */
  suggestion?: string;
};

// ---------------------------------------------------------------- email

/**
 * Throwaway-inbox providers. Not exhaustive and never will be; these are the
 * ones that actually turn up in form spam. A guest who genuinely books from
 * one of these gets a clear ask for a reachable address, not a silent fail.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.de",
  "sharklasers.com", "grr.la", "guerrillamailblock.com", "10minutemail.com", "10minutemail.net",
  "10minemail.com", "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmailo.com",
  "tempail.com", "tempr.email", "discard.email", "discardmail.com", "yopmail.com", "yopmail.fr",
  "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj",
  "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf", "monemail.fr.nf", "monmail.fr.nf",
  "trashmail.com", "trashmail.net", "trashmail.me", "trashmail.at", "trash-mail.com", "trash-mail.at",
  "kurzepost.de", "objectmail.com", "proxymail.eu", "rcpt.at", "wegwerfmail.de", "wegwerfmail.net",
  "wegwerfmail.org", "mailnesia.com", "maildrop.cc", "mailsac.com", "dispostable.com", "fakeinbox.com",
  "fakemailgenerator.com", "emailondeck.com", "getnada.com", "nada.email", "mohmal.com", "mintemail.com",
  "mytemp.email", "throwawaymail.com", "throwam.com", "mailcatch.com", "spamgourmet.com", "spam4.me",
  "spamex.com", "mailexpire.com", "tempinbox.com", "tempinbox.co.uk", "burnermail.io", "getairmail.com",
  "airmail.cc", "inboxbear.com", "mailtemp.net", "tmpmail.org", "tmpmail.net", "tmpeml.com",
  "emailfake.com", "generator.email", "crazymailing.com", "1secmail.com", "1secmail.org", "1secmail.net",
  "wwjmp.com", "esiix.com", "xojxe.com", "yoggm.com", "dcctb.com", "oosln.com", "mailpoof.com",
  "harakirimail.com", "spambox.us", "mailforspam.com", "incognitomail.com", "mailhazard.com",
  "anonbox.net", "anonymbox.com", "mailmoat.com", "meltmail.com", "filzmail.com", "guerillamail.com",
  "guerillamail.net", "guerillamail.org", "guerillamail.biz", "pokemail.net", "spam.la", "tempsky.com",
  "mailtothis.com", "zetmail.com", "rtrtr.com", "mvrht.com", "nwytg.com", "cuvox.de", "dayrep.com",
  "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us",
  "armyspy.com", "mailseal.de", "tempmail.plus", "linshiyouxiang.net", "bupmail.com", "emltmp.com",
  "moakt.com", "moakt.cc", "tmails.net", "tmail.ws", "disbox.net", "disbox.org", "mailbox.in.ua",
  "luxusmail.org", "vintomaper.com", "fexpost.com", "fexbox.org", "mailbox92.biz", "mailbox52.ga",
  "example.com", "example.org", "example.net", "test.com",
]);

/** Providers a guest is most likely aiming at when a domain is one slip away. */
const COMMON_DOMAINS = [
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "me.com", "aol.com",
  "protonmail.com", "proton.me", "bigpond.com", "bigpond.net.au", "optusnet.com.au", "yahoo.com.au",
  "hotmail.co.uk", "yahoo.co.uk", "outlook.com.au", "live.com.au", "hotmail.com.au", "xtra.co.nz",
  "gmail.co.uk", "comcast.net", "msn.com", "btinternet.com", "sbcglobal.net", "verizon.net", "att.net",
  "iinet.net.au", "tpg.com.au", "internode.on.net", "westnet.com.au", "dodo.com.au", "ozemail.com.au",
];

/** Domains that are themselves fine but are one slip away from a common one — never "correct" these. */
const REAL_LOOKALIKES = new Set(["mail.com", "gmx.com", "gmx.net", "gmx.de", "mac.com", "ymail.com", "rocketmail.com"]);

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Syntax, throwaway providers and near-miss domains. `email_typo` is a
 * SUGGESTION: the form offers the fix, the server does not refuse on it
 * (the mailbox check does that job with facts, not guesses).
 */
export function emailProblem(raw: string): ContactProblem | null {
  const email = raw.trim();
  const at = email.lastIndexOf("@");
  const local = at > 0 ? email.slice(0, at) : "";
  const domain = emailDomain(email);
  if (!EMAIL_RE.test(email) || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { code: "email_syntax", message: "That doesn't look like a complete email address — check it and try again." };
  }
  if (DISPOSABLE_DOMAINS.has(domain) || [...DISPOSABLE_DOMAINS].some((d) => domain.endsWith(`.${d}`))) {
    return {
      code: "email_disposable",
      message: "Please use an email address we can reach you on later — temporary inboxes won't work for your booking details.",
    };
  }
  const suggestion = suggestDomain(domain);
  if (suggestion) {
    return { code: "email_typo", message: `Did you mean ${local}@${suggestion}?`, suggestion: `${local}@${suggestion}` };
  }
  return null;
}

/** A common provider within one slip of the typed domain, or null. */
export function suggestDomain(domain: string): string | null {
  if (!domain || COMMON_DOMAINS.includes(domain) || REAL_LOOKALIKES.has(domain)) return null;
  // ".con", ".cmo", ".coom" style slips on any domain.
  const tldFix = domain.replace(/\.(con|cmo|coom|ocm|vom|xom|comm|cm)$/, ".com").replace(/\.(cpm)$/, ".com");
  if (tldFix !== domain) return tldFix;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    const limit = candidate.length <= 9 ? 1 : 2;
    if (distance > 0 && distance <= limit && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Damerau–Levenshtein with adjacent transpositions (gmial → gmail is 1). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// ---------------------------------------------------------------- phone

const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Checks an E.164 number (what the form submits). `country` is the
 * dial-code entry it belongs to — the one the guest picked in the form, or
 * `countryForE164()` on the server — or null for "Other"/unlisted, which
 * only gets the universal E.164 checks. (Passed in rather than imported so
 * this file has no runtime imports and tests run under plain node.)
 */
export function phoneProblem(e164: string, country: DialCountry | null): ContactProblem | null {
  const value = e164.replace(/[\s()-]/g, "");
  if (!E164_RE.test(value)) {
    return { code: "phone_syntax", message: "Please enter a phone number with digits only — we'll add the country code." };
  }
  const national = country ? value.slice(1 + country.dial.length) : value.slice(1);
  const where = country ? ` for ${country.name}` : "";

  if (country) {
    const [min, max] = country.digits;
    if (national.length < min) {
      return { code: "phone_short", message: `That number looks too short${where} — check it and try again.` };
    }
    if (national.length > max) {
      return { code: "phone_long", message: `That number looks too long${where} — check it and try again.` };
    }
    if (national === country.example.replace(/\D/g, "")) {
      return { code: "phone_example", message: "That's our example number — please enter your own." };
    }
  } else if (national.length < 7) {
    return { code: "phone_short", message: "That number looks too short — check it and try again." };
  }
  if (national === "971501234567" || value === "+971501234567") {
    return { code: "phone_example", message: "That's our example number — please enter your own." };
  }
  if (looksMadeUp(national)) {
    return { code: "phone_pattern", message: "That number doesn't look real — please check it. We use it to call you." };
  }
  return null;
}

/**
 * 0000000000, 1111111111, 1234567890, 9876543210, 1212121212 … Only a
 * number that is a run END TO END counts: real numbers like 0412 345 678
 * exist and are somebody's, so a partial run is left alone.
 */
export function looksMadeUp(digits: string): boolean {
  if (digits.length < 6) return false;
  if (/^(\d)\1+$/.test(digits)) return true;
  if ("01234567890123456789".includes(digits) || "98765432109876543210".includes(digits)) return true;
  if (/^(\d\d)\1{2,}$/.test(digits)) return true;
  const distinct = new Set(digits).size;
  return digits.length >= 9 && distinct <= 2;
}

// ---------------------------------------------------------------- name / notes

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ru|xyz|info|biz|top|site|online|shop)\b)/i;

/** A name with a link or markup in it was never typed by a person booking a call. */
export function nameProblem(name: string): ContactProblem | null {
  const value = name.trim();
  if (URL_RE.test(value) || /[<>{}[\]]/.test(value) || /\d{5,}/.test(value)) {
    return { code: "name_link", message: "Please enter just your name here." };
  }
  return null;
}

/** Notes are free text; only a pile of links marks them as spam. */
export function notesProblem(notes: string): ContactProblem | null {
  const links = notes.match(/https?:\/\/\S+|www\.\S+/gi)?.length ?? 0;
  if (links >= 3) {
    return { code: "notes_spam", message: "Please keep links out of your message — tell us about the trip instead." };
  }
  return null;
}

/** Which form field a problem code belongs to. */
export function problemField(code: ContactProblem["code"] | string): "email" | "phone" | "name" | "notes" | null {
  if (code.startsWith("email_")) return "email";
  if (code.startsWith("phone_")) return "phone";
  if (code.startsWith("name_")) return "name";
  if (code.startsWith("notes_")) return "notes";
  return null;
}
