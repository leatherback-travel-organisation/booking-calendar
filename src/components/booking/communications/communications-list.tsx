// Server-rendered list of guest messages, structured by the guest's journey
// — not by workflow nesting. One click from any row to its editor.

import Link from "next/link";
import {
  formatDiffDate,
  JOURNEY_STAGES,
  MOMENT_META,
  type MomentSummary,
} from "@/lib/booking/notify/template-scope.ts";
import styles from "./communications-list.module.css";

type CommunicationsListProps = {
  summaries: MomentSummary[];
  canManage: boolean;
};

function overrideLabel(override: MomentSummary["overrides"][number]): string {
  return override.eventTypeKey ? `${override.brandName} · ${override.eventTypeKey}` : override.brandName;
}

export function CommunicationsList({ summaries, canManage }: CommunicationsListProps) {
  const byMoment = new Map(summaries.map((summary) => [summary.moment, summary]));

  return (
    <div className={styles.journey}>
      <p className={styles.intro}>
        Every email a guest receives, in the order they receive it. Edit the default once, or tailor a message
        for a single brand or call type.
      </p>
      {JOURNEY_STAGES.map((stage) => (
        <section key={stage.key} className={styles.stage}>
          <h2 className={styles.stageTitle}>{stage.title}</h2>
          <ul className={styles.rows}>
            {stage.moments.map((moment) => {
              const summary = byMoment.get(moment);
              const meta = MOMENT_META[moment];
              const untouched = !summary || summary.lastEdited === null;
              const setUp = moment === "followup" && untouched;
              return (
                <li key={moment} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowName}>{meta.label}</p>
                    <p className={styles.rowDescription}>{meta.description}</p>
                    <div className={styles.chips}>
                      <span className={styles.chip} data-kind={summary?.hasCustomDefault ? "custom" : "builtin"}>
                        Default
                      </span>
                      {summary?.overrides.map((override) => (
                        <span
                          key={`${override.brandKey}:${override.eventTypeKey ?? ""}`}
                          className={styles.chip}
                          data-kind="override"
                        >
                          {overrideLabel(override)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.edited}>
                      {summary?.lastEdited
                        ? `Edited ${formatDiffDate(summary.lastEdited.at)}${summary.lastEdited.by ? ` by ${summary.lastEdited.by}` : ""}`
                        : "Built-in default"}
                    </span>
                    <div className={styles.rowActions}>
                      <Link
                        href={`/booking/communications/${moment}`}
                        className={styles.actionButton}
                        data-primary={setUp || undefined}
                      >
                        {setUp ? "Set up" : canManage ? "Edit" : "View"}
                      </Link>
                      <Link href={`/booking/communications/${moment}?preview=1`} className={styles.actionButton}>
                        Preview
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
            {stage.key === "after-booking" ? (
              <li className={`${styles.row} ${styles.rowInfo}`}>
                <div className={styles.rowMain}>
                  <p className={styles.rowName}>Calendar invitation</p>
                  <p className={styles.rowDescription}>
                    An .ics file attached to the confirmation, updated on reschedule and withdrawn on
                    cancellation. Generated from the booking — nothing to edit here.
                  </p>
                </div>
                <div className={styles.rowSide}>
                  <span className={styles.edited}>Automatic</span>
                </div>
              </li>
            ) : null}
          </ul>
        </section>
      ))}
    </div>
  );
}
