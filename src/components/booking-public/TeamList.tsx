"use client";

// Ranked team members for the guest to CHOOSE from — used both as the main
// pool UI ("book with the team") and behind the primary flow's
// "Can't find a time that works?" link. Ordering, never assignment.

import styles from "./bp.module.css";
import { formatSlotShort } from "./format";
import type { BackupEntry } from "./types";

export function TeamList({
  backups,
  timeZone,
  onPick,
}: {
  backups: BackupEntry[];
  timeZone: string;
  onPick: (entry: BackupEntry) => void;
}) {
  return (
    <div className={styles.backupList}>
      {backups.map((entry) => (
        <button
          key={entry.staff.slug}
          type="button"
          className={styles.backupCard}
          onClick={() => onPick(entry)}
        >
          {entry.staff.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.staff.photoUrl} alt="" className={styles.backupPhoto} />
          ) : (
            <span className={styles.backupPhotoFallback} aria-hidden="true">
              {entry.staff.firstName.charAt(0)}
            </span>
          )}
          <span>
            <span className={styles.backupName}>{entry.staff.firstName}</span>
            <span className={styles.backupMeta}>
              {entry.firstSlot
                ? `Next available ${formatSlotShort(entry.firstSlot, timeZone)} · ${entry.openSlotCount} open ${entry.openSlotCount === 1 ? "time" : "times"} this week`
                : "Availability on request"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
