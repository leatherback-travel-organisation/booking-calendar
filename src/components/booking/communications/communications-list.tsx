// Server-rendered list of guest messages, grouped by brand (Nicola, 15 Sep).
//
// It used to be grouped by message, with a row of brand chips under each —
// which answered "who has tailored the confirmation email?" But the question
// a Pod Lead actually arrives with is "what does Carex send?", and that
// answer was scattered across five cards. One section per brand, its five
// messages in the order a guest receives them, each a click from its editor.

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  formatDiffDate,
  MOMENT_META,
  type BrandSummary,
} from "@/lib/booking/notify/template-scope.ts";
import styles from "./communications-list.module.css";

type CommunicationsListProps = {
  summaries: BrandSummary[];
  brands: Array<{ key: string; name: string; colorPrimary: string | null }>;
};

export function CommunicationsList({ summaries, brands }: CommunicationsListProps) {
  const colorByKey = new Map(brands.map((brand) => [brand.key, brand.colorPrimary]));

  return (
    <div className={styles.journey}>
      <p className={styles.intro}>
        Every email a guest receives, brand by brand, in the order they receive it. Click a message to edit
        that brand&rsquo;s version — previews live in the editor.
      </p>
      {summaries.map((summary) => {
        const color = colorByKey.get(summary.brandKey) ?? null;
        return (
          <section
            key={summary.brandKey}
            className={styles.brandGroup}
            style={color ? ({ "--tag": color } as CSSProperties) : undefined}
          >
            <div className={styles.brandHead}>
              <h2 className={styles.brandTitle}>{summary.brandName}</h2>
              <span className={styles.brandCount}>
                {summary.tailoredCount === 0
                  ? "All using the shared wording"
                  : summary.tailoredCount === summary.moments.length
                    ? "All written for this brand"
                    : `${summary.tailoredCount} of ${summary.moments.length} written for this brand`}
              </span>
            </div>
            <ul className={styles.rows}>
              {summary.moments.map((cell) => {
                const meta = MOMENT_META[cell.moment];
                return (
                  <li key={cell.moment}>
                    <Link
                      href={`/booking/communications/${cell.moment}?brand=${encodeURIComponent(summary.brandKey)}`}
                      className={styles.messageRow}
                      data-tailored={cell.tailored || undefined}
                      title={
                        cell.tailored
                          ? `Written for ${summary.brandName} — click to edit`
                          : `Uses the shared wording — click to tailor it for ${summary.brandName}`
                      }
                    >
                      <span className={styles.messageName}>{meta.label}</span>
                      {/* Say the one thing that is true of THIS row rather
                          than repeating "Tailored" down the whole page: the
                          seed gave every brand a version of everything. */}
                      <span className={styles.messageState}>
                        {!cell.tailored
                          ? "Shared wording"
                          : cell.typeVariants > 0
                            ? `${cell.typeVariants} call-type versions`
                            : "Tailored"}
                      </span>
                      <span className={styles.edited}>
                        {cell.lastEdited
                          ? `Edited ${formatDiffDate(cell.lastEdited.at)}${cell.lastEdited.by ? ` by ${cell.lastEdited.by}` : ""}`
                          : "Built-in default"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
