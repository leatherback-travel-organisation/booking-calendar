// Template rendering. Variables are {{group.key}} chips validated against the
// registry: an unknown variable is a hard error at SAVE time and at render
// time — a typo'd {{first_nmae}} must never reach a guest as "Hi ,".

import { isKnownVariable, type VariableName } from "./variables.ts";

const VARIABLE_PATTERN = /\{\{\s*([a-z_]+\.[a-z_0-9]+)\s*\}\}/g;
const ANY_MUSTACHE = /\{\{([^}]*)\}\}/g;

export class UnknownVariableError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Unknown template variable${variables.length > 1 ? "s" : ""}: ${variables.join(", ")}`);
    this.name = "UnknownVariableError";
    this.variables = variables;
  }
}

/** Every variable referenced in a template body, validated or not. */
export function extractVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(ANY_MUSTACHE)) {
    found.add(match[1].trim());
  }
  return [...found];
}

/** Throws UnknownVariableError listing every bad reference. Used on save. */
export function validateTemplate(body: string): void {
  const unknown = extractVariables(body).filter((name) => !isKnownVariable(name));
  if (unknown.length > 0) throw new UnknownVariableError(unknown);
}

/**
 * Substitute values. Refuses to render templates with unknown variables and
 * refuses to render when a known variable has no value supplied — silence is
 * how guests get "Hi ," emails.
 */
export function renderTemplate(body: string, values: Partial<Record<VariableName, string>>): string {
  validateTemplate(body);
  const missing: string[] = [];
  const rendered = body.replace(VARIABLE_PATTERN, (whole, name: string) => {
    const value = values[name as VariableName];
    if (value === undefined) {
      missing.push(name);
      return whole;
    }
    return value;
  });
  if (missing.length > 0) {
    throw new UnknownVariableError(missing.map((name) => `${name} (no value supplied)`));
  }
  return rendered;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type BrandShellInput = {
  brandName: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  /** Secondary brand colour — links and the card's soft wash; primary keeps the top band. */
  colorAccent: string | null;
  supportPhone: string | null;
  fromName: string;
};

/**
 * Per-brand email shell. Each brand gets its own visual identity — logo,
 * colour, footer, support phone — not one Leatherback template with a
 * swapped logo. Inline styles only; email clients ignore stylesheets.
 */
export function renderBrandEmail(shell: BrandShellInput, bodyHtml: string): string {
  const accent = shell.colorPrimary ?? "#1f3d33";
  const secondary = shell.colorAccent ?? accent;
  const logo = shell.logoUrl
    ? `<img src="${escapeHtml(shell.logoUrl)}" alt="${escapeHtml(shell.brandName)}" style="max-height:72px;max-width:340px;" />`
    : `<span style="font-size:22px;font-weight:600;color:${accent};">${escapeHtml(shell.brandName)}</span>`;
  const phone = shell.supportPhone
    ? `<p style="margin:4px 0 0;">Need a hand? Call us on <strong>${escapeHtml(shell.supportPhone)}</strong>.</p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#22271f;">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
      <div style="padding:8px 0 24px;">${logo}</div>
      <div style="background:#ffffff;border-radius:10px;padding:32px 28px;border-top:4px solid ${accent};font-size:16px;line-height:1.55;">
        ${bodyHtml.replace(/<a /g, `<a style="color:${accent};" `)}
      </div>
      <div style="height:3px;max-width:120px;margin:14px 0 0 8px;background:${secondary};border-radius:2px;"></div>
      <div style="padding:20px 8px;font-size:13px;color:#6b7266;">
        <p style="margin:0;">${escapeHtml(shell.fromName)}</p>
        ${phone}
      </div>
    </div>
  </body>
</html>`;
}

/** Plain-text alternative derived from the rendered HTML body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
