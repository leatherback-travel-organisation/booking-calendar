// Server-rendered list of guest messages, grouped by brand (Nicola, 15 Sep).
//
// One section per brand, its five messages in the order a guest receives
// them, each a click from its editor. The row says what the message IS in
// plain words; it does not recite bookkeeping. Counts of call-type versions
// and seed actors ("seed:brand-voice") were the small print Nicola asked to
// lose — a Pod Lead cannot act on them here, and the editor shows the
// versions anyway. What remains on the right is the one thing worth a glance:
// whether the brand is still on the shared wording.

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  editorLabel,
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
        The emails each brand sends a guest, in the order they arrive. Open a message to read it or change
        the wording.
      </p>
      {summaries.map((summary) => {
        const color = colorByKey.get(summary.brandKey) ?? null;
        const sharedCount = summary.moments.length - summary.tailoredCount;
        return (
          <section
            key={summary.brandKey}
            className={styles.brandGroup}
            style={color ? ({ "--tag": color } as CSSProperties) : undefined}
          >
            <div className={styles.brandHead}>
              <span className={styles.brandDot} aria-hidden="true" />
              <h2 className={styles.brandTitle}>{summary.brandName}</h2>
              {/* Only say something when there is something to do: a brand
                  that has written all its own messages needs no badge. */}
              {sharedCount > 0 && (
                <span className={styles.brandNote}>
                  {sharedCount === summary.moments.length
                    ? "Using the shared wording"
                    : `${sharedCount} of ${summary.moments.length} use the shared wording`}
                </span>
              )}
            </div>
            <ul className={styles.rows}>
              {summary.moments.map((cell) => {
                const meta = MOMENT_META[cell.moment];
                const editor = cell.lastEdited ? editorLabel(cell.lastEdited.by) : null;
                return (
                  <li key={cell.moment}>
                    <Link
                      href={`/booking/communications/${cell.moment}?brand=${encodeURIComponent(summary.brandKey)}`}
                      className={styles.messageRow}
                      data-tailored={cell.tailored || undefined}
                    >
                      <span className={styles.messageText}>
                        <span className={styles.messageName}>{meta.label}</span>
                        <span className={styles.messageDescription}>{meta.description}</span>
                        {editor && cell.lastEdited && (
                          <span className={styles.messageEdited}>
                            Changed by {editor}, {formatDiffDate(cell.lastEdited.at)}
                          </span>
                        )}
                      </span>
                      {!cell.tailored && <span className={styles.sharedPill}>Shared wording</span>}
                      <span className={styles.open} aria-hidden="true">
                        Open
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
