import Link from "next/link";
import type { CoverageIssueRow, DepartureStats } from "@/lib/booking/reference/queries";
import styles from "./coverage-map.module.css";

const SEVERITY_ORDER = ["error", "warning", "info"] as const;

const SEVERITY_LABEL: Record<(typeof SEVERITY_ORDER)[number], string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Notes",
};

const ROSTER_KINDS = new Set([
  "staff-calendar-unreachable",
  "calendar-never-checked",
  "staff-brand-unmapped",
  "notion-airtable-email-mismatch",
  "brand-single-bm",
  "brand-no-bm",
]);

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function issueLink(issue: CoverageIssueRow): { href: string; label: string; external: boolean } | null {
  const url = issue.detail?.url;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    return { href: url, label: "View trip", external: true };
  }
  if (ROSTER_KINDS.has(issue.kind)) {
    return { href: "/booking/team", label: "Open roster", external: false };
  }
  return null;
}

type CoverageMapProps = {
  issues: CoverageIssueRow[];
  stats: DepartureStats;
  canManage: boolean;
  runSyncAction?: () => Promise<void>;
};

export function CoverageMap({ issues, stats, canManage, runSyncAction }: CoverageMapProps) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;

  return (
    <div className={styles.coverage}>
      <section className={styles.summary}>
        <div className={styles.summaryCounts}>
          {SEVERITY_ORDER.map((severity) => (
            <span key={severity} className={styles.summaryCount} data-severity={severity}>
              <i aria-hidden="true" />
              {counts[severity]} {SEVERITY_LABEL[severity].toLowerCase()}
            </span>
          ))}
          <span className={styles.summaryMeta}>
            {stats.totalUpcoming} upcoming departures
            {stats.lastSyncedAt ? ` · synced ${formatRelative(stats.lastSyncedAt)}` : " · never synced"}
          </span>
        </div>
        {canManage && runSyncAction ? (
          <form action={runSyncAction}>
            <button type="submit" className={styles.syncButton}>
              Run sync now
            </button>
          </form>
        ) : null}
      </section>

      {issues.length === 0 ? (
        <div className={styles.empty}>
          <strong>Everything routable.</strong>
          <span>
            {stats.totalUpcoming} upcoming departure{stats.totalUpcoming === 1 ? "" : "s"}, all with a Booking
            Manager.
          </span>
        </div>
      ) : (
        SEVERITY_ORDER.filter((severity) => counts[severity] > 0).map((severity) => (
          <section key={severity} className={styles.group}>
            <h2 className={styles.groupTitle} data-severity={severity}>
              <i aria-hidden="true" />
              {SEVERITY_LABEL[severity]}
            </h2>
            <ul className={styles.issueList}>
              {issues
                .filter((issue) => issue.severity === severity)
                .map((issue) => {
                  const link = issueLink(issue);
                  return (
                    <li key={issue.id} className={styles.issue}>
                      <div className={styles.issueBody}>
                        <p className={styles.issueMessage}>{issue.message}</p>
                        <div className={styles.issueMeta}>
                          <span className={styles.chip}>{issue.kind}</span>
                          <span className={styles.chip}>{issue.subjectRef}</span>
                          <span className={styles.times}>
                            first seen {formatRelative(issue.firstSeen)} · last seen {formatRelative(issue.lastSeen)}
                          </span>
                        </div>
                      </div>
                      {link ? (
                        link.external ? (
                          <a className={styles.issueLink} href={link.href} target="_blank" rel="noreferrer">
                            {link.label}
                          </a>
                        ) : (
                          <Link className={styles.issueLink} href={link.href}>
                            {link.label}
                          </Link>
                        )
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))
      )}

      <aside className={styles.explainer}>
        <h2>How routing works</h2>
        <p>
          Routing is derived from Airtable&apos;s Trip Coordinator field. There are no rules to configure here —
          fix the source data and re-run the sync.
        </p>
      </aside>
    </div>
  );
}
