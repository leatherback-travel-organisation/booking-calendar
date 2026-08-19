// Pure template-scope logic for the Guest Communications editor: moment
// metadata (the guest-journey structure), chip <-> token serialization for
// the Tiptap editor, and the resolution/diff computations the list page and
// the "apply to many" panel display. No IO — everything here is testable
// with plain node --test.

import type { Moment } from "./messages.ts";

export type { Moment } from "./messages.ts";

export const MOMENTS: readonly Moment[] = [
  "confirmation",
  "reminder_24h",
  "reminder_1h",
  "cancellation",
  "reschedule",
];

export function isMoment(value: string): value is Moment {
  return (MOMENTS as readonly string[]).includes(value);
}

export const MOMENT_META: Record<Moment, { label: string; description: string }> = {
  confirmation: {
    label: "Confirmation email",
    description: "Sent the moment a guest books. Includes join, reschedule and cancel links.",
  },
  reminder_24h: {
    label: "24-hour reminder",
    description: "Sent the day before the call, in the guest's own timezone.",
  },
  reminder_1h: {
    label: "1-hour reminder",
    description: "A short nudge with the join link, about an hour before the call.",
  },
  reschedule: {
    label: "Reschedule confirmation",
    description: "Confirms the new time. The guest's calendar entry updates itself.",
  },
  cancellation: {
    label: "Cancellation notice",
    description: "Confirms the cancellation and removes the event from the guest's calendar.",
  },
};

export type JourneyStage = {
  key: string;
  title: string;
  moments: readonly Moment[];
};

/** The list page is structured by the guest's journey, not by workflow. */
export const JOURNEY_STAGES: readonly JourneyStage[] = [
  { key: "after-booking", title: "After booking", moments: ["confirmation"] },
  { key: "before-call", title: "Before the call", moments: ["reminder_24h", "reminder_1h"] },
  { key: "plans-change", title: "If plans change", moments: ["reschedule", "cancellation"] },
];

// --- chip <-> token serialization ------------------------------------------
//
// Stored templates use {{group.key}} tokens (what render.ts validates and
// substitutes). The Tiptap editor renders each token as an inline atom chip:
// <span data-variable="group.key">Label</span>. Loading converts tokens to
// spans before setContent; saving converts the editor's HTML back to tokens.

const TOKEN_PATTERN = /\{\{\s*([a-z_]+\.[a-z_0-9]+)\s*\}\}/g;
const CHIP_PATTERN = /<span\b[^>]*\bdata-variable="([^"]+)"[^>]*>.*?<\/span>/g;

/**
 * Stored body_html -> editor HTML: {{group.key}} becomes a chip span — but
 * only in text content. A token inside a tag (an href attribute, say) must
 * stay literal, or the surrounding markup shatters into `">` fragments.
 */
export function tokensToChipHtml(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part) =>
      part.startsWith("<")
        ? part
        : part.replace(TOKEN_PATTERN, (_match, name: string) => `<span data-variable="${name}"></span>`),
    )
    .join("");
}

/** Editor HTML -> stored body_html: chip spans become {{group.key}} tokens. */
export function chipHtmlToTokens(html: string): string {
  return html.replace(CHIP_PATTERN, (_match, name: string) => `{{${name}}}`);
}

// --- scope rows -------------------------------------------------------------

/** An active booking.message_template row, brand id already mapped to key. */
export type TemplateRowMeta = {
  moment: Moment;
  /** null = the global default scope. */
  brandKey: string | null;
  /** null = all event types. */
  eventTypeKey: string | null;
  updatedBy: string | null;
  /** ISO timestamp. */
  updatedAt: string;
};

export type BrandRefLite = { key: string; name: string };

export function brandName(brands: readonly BrandRefLite[], key: string | null): string {
  if (key === null) return "Default";
  return brands.find((brand) => brand.key === key)?.name ?? key;
}

// --- resolution precedence (display) ---------------------------------------

export type ScopeSource = "brand-type" | "brand" | "default" | "built-in";

/**
 * Which stored row (if any) a given scope resolves to, mirroring
 * resolveTemplate's precedence: (brand, type) > (brand, all) > (default, all)
 * > the built-in seed template.
 */
export function displaySource(
  rows: readonly TemplateRowMeta[],
  moment: Moment,
  brandKey: string | null,
  eventTypeKey: string | null,
): ScopeSource {
  const scoped = rows.filter((row) => row.moment === moment);
  const has = (brand: string | null, type: string | null) =>
    scoped.some((row) => row.brandKey === brand && row.eventTypeKey === type);
  if (brandKey && eventTypeKey && has(brandKey, eventTypeKey)) return "brand-type";
  if (brandKey && has(brandKey, null)) return "brand";
  if (has(null, null)) return "default";
  return "built-in";
}

export const SOURCE_LABEL: Record<ScopeSource, string> = {
  "brand-type": "Custom for this brand and call type",
  brand: "Custom for this brand",
  default: "Custom default (all brands)",
  "built-in": "Built-in default",
};

// --- list page summaries ----------------------------------------------------

export type MomentSummary = {
  moment: Moment;
  /** True when someone saved a custom global default. */
  hasCustomDefault: boolean;
  /** Brand-scoped overrides, one entry per (brand, type) row. */
  overrides: Array<{ brandKey: string; brandName: string; eventTypeKey: string | null }>;
  /** Most recent edit across every scope; null = running on the built-in. */
  lastEdited: { by: string | null; at: string } | null;
};

export function summarizeMoment(
  moment: Moment,
  rows: readonly TemplateRowMeta[],
  brands: readonly BrandRefLite[],
): MomentSummary {
  const scoped = rows.filter((row) => row.moment === moment);
  const overrides = scoped
    .filter((row) => row.brandKey !== null)
    .map((row) => ({
      brandKey: row.brandKey as string,
      brandName: brandName(brands, row.brandKey),
      eventTypeKey: row.eventTypeKey,
    }))
    .sort((a, b) => a.brandName.localeCompare(b.brandName) || (a.eventTypeKey ?? "").localeCompare(b.eventTypeKey ?? ""));
  const latest = scoped.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  return {
    moment,
    hasCustomDefault: scoped.some((row) => row.brandKey === null && row.eventTypeKey === null),
    overrides,
    lastEdited: latest ? { by: latest.updatedBy, at: latest.updatedAt } : null,
  };
}

// --- apply-to-many diff -----------------------------------------------------

export type ApplyTarget = { brandKey: string; eventTypeKey: string | null };

export type ApplyDiffRow = {
  brandKey: string;
  brandName: string;
  eventTypeKey: string | null;
  /** replace = an existing custom template at exactly this scope is overwritten. */
  action: "replace" | "create";
  existing: { updatedBy: string | null; updatedAt: string } | null;
  /** Human sentence shown in the confirm panel. */
  summary: string;
};

const DIFF_DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDiffDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return DIFF_DATE.format(parsed);
}

/**
 * The explicit "what will be overwritten" summary for the apply-to-many
 * panel. Never silent: every target gets a sentence, and targets that
 * already carry a custom template say who edited them and when.
 */
export function computeApplyDiff(
  moment: Moment,
  targets: readonly ApplyTarget[],
  rows: readonly TemplateRowMeta[],
  brands: readonly BrandRefLite[],
): ApplyDiffRow[] {
  const momentLabel = MOMENT_META[moment].label;
  return targets.map((target) => {
    const name = brandName(brands, target.brandKey);
    const typeSuffix = target.eventTypeKey ? ` (${target.eventTypeKey})` : "";
    const scopeLabel = `${name}${typeSuffix} / ${momentLabel}`;
    const existing = rows.find(
      (row) =>
        row.moment === moment && row.brandKey === target.brandKey && row.eventTypeKey === target.eventTypeKey,
    );
    if (existing) {
      const by = existing.updatedBy ?? "unknown";
      return {
        brandKey: target.brandKey,
        brandName: name,
        eventTypeKey: target.eventTypeKey,
        action: "replace" as const,
        existing: { updatedBy: existing.updatedBy, updatedAt: existing.updatedAt },
        summary: `${scopeLabel} currently has a custom template edited by ${by} on ${formatDiffDate(existing.updatedAt)} — it will be replaced.`,
      };
    }
    const inherits = displaySource(rows, moment, target.brandKey, target.eventTypeKey);
    const inheritsLabel = inherits === "built-in" ? "the built-in default" : `the ${SOURCE_LABEL[inherits].toLowerCase()}`;
    return {
      brandKey: target.brandKey,
      brandName: name,
      eventTypeKey: target.eventTypeKey,
      action: "create" as const,
      existing: null,
      summary: `${scopeLabel} currently uses ${inheritsLabel} — a new custom template will be created.`,
    };
  });
}
