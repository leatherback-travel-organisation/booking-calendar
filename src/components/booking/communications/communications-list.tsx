// Server-rendered list of guest messages, structured by the guest's journey
// — not by workflow nesting. One click from any row to its editor, and one
// click per brand straight into that brand's version.

import type { CSSProperties } from "react";
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
  brands: Array<{ key: string; name: string; colorPrimary: string | null }>;
};

export function CommunicationsList({ summaries, brands }: CommunicationsListProps) {
  const byMoment = new Map(summaries.map((summary) => [summary.moment, summary]));

  return (
    <div className={styles.journey}>
      <p className={styles.intro}>
        Every email a guest receives, in the order they receive it. Click a brand to edit its version of a
        message — previews live in the editor.
      </p>
      {JOURNEY_STAGES.map((stage) => (
        <section key={stage.key} className={styles.stage}>
          <h2 className={styles.stageTitle}>{stage.title}</h2>
          <ul className={styles.rows}>
            {stage.moments.map((moment) => {
              const summary = byMoment.get(moment);
              const meta = MOMENT_META[moment];
              return (
                <li key={moment} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowName}>{meta.label}</p>
                    <p className={styles.rowDescription}>{meta.description}</p>
                    <div className={styles.chips}>
                      {brands.map((brand) => {
                        const overrides = summary?.overrides.filter((o) => o.brandKey === brand.key) ?? [];
                        const tailored = overrides.length > 0;
                        return (
                          <Link
                            key={brand.key}
                            href={`/booking/communications/${moment}?brand=${encodeURIComponent(brand.key)}`}
                            className={styles.brandLink}
                            data-tailored={tailored || undefined}
                            style={brand.colorPrimary ? ({ "--tag": brand.colorPrimary } as CSSProperties) : undefined}
                            title={
                              tailored
                                ? `Tailored for ${brand.name}${overrides.some((o) => o.eventTypeKey) ? ` (incl. per-call-type)` : ""} — click to edit`
                                : `Uses the default — click to tailor for ${brand.name}`
                            }
                          >
                            {brand.name}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.edited}>
                      {summary?.lastEdited
                        ? `Edited ${formatDiffDate(summary.lastEdited.at)}${summary.lastEdited.by ? ` by ${summary.lastEdited.by}` : ""}`
                        : "Built-in default"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
