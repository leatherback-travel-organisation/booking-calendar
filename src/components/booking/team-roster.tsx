import Link from "next/link";
import type { Brand, Staff } from "@/lib/booking/model";
import { CopyButton } from "./team-tools/copy-button";
import styles from "./team-roster.module.css";

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

type TeamRosterProps = {
  staff: Staff[];
  brands: Brand[];
  /** Last fetch time per reference cache key. */
  fetchedAt: Record<string, string | null>;
  /** Origin for guest-facing booking links, e.g. http://localhost:3000. */
  appUrl: string;
  /** Guest-bookable call types — one copy link per type per BM. */
  guestTypes: Array<{ key: string; name: string }>;
};

export function TeamRoster({ staff, brands, fetchedAt, appUrl, guestTypes }: TeamRosterProps) {
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const active = staff.filter((member) => member.active).length;

  return (
    <div className={styles.roster}>
      <header className={styles.header}>
        <p className={styles.counts}>
          {staff.length} Booking Manager{staff.length === 1 ? "" : "s"} · {active} active
        </p>
        <p className={styles.syncTimes}>
          Notion roster synced {formatRelative(fetchedAt["notion:staff"] ?? null)} · Airtable managers synced{" "}
          {formatRelative(fetchedAt["airtable:booking-managers"] ?? null)}
        </p>
      </header>

      {staff.length === 0 ? (
        <div className={styles.empty}>No staff yet — run the reference sync to import the Notion roster.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Booking Manager</th>
                <th scope="col">Copy links</th>
                <th scope="col">Group session</th>
                <th scope="col">Brands</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                return (
                  <tr key={member.id} className={member.active ? undefined : styles.inactiveRow}>
                    <td>
                      <div className={styles.person}>
                        {member.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={styles.photo} src={member.photoUrl} alt="" />
                        ) : (
                          <span className={styles.photoFallback} aria-hidden="true">
                            {initials(member.fullName)}
                          </span>
                        )}
                        <div className={styles.personText}>
                          <div className={styles.nameRow}>
                            <Link href={`/booking/team/${encodeURIComponent(member.slug)}`} className={styles.personLink}>
                              <strong>{member.fullName}</strong>
                            </Link>
                            {!member.reminder24hEnabled && !member.reminder1hEnabled ? (
                              <span className={styles.mutedChip}>Reminders off</span>
                            ) : !member.reminder24hEnabled ? (
                              <span className={styles.mutedChip}>24h reminder off</span>
                            ) : !member.reminder1hEnabled ? (
                              <span className={styles.mutedChip}>1h reminder off</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.copyRow}>
                        {guestTypes.map((type) => (
                          <CopyButton
                            key={type.key}
                            value={`${appUrl}/book?bm=${encodeURIComponent(member.slug)}&type=${encodeURIComponent(type.key)}`}
                            label={type.name.replace(/ Call$/, "")}
                          />
                        ))}
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/booking/team/sessions?staff=${encodeURIComponent(member.slug)}`}
                        className={styles.actionLink}
                      >
                        Create
                      </Link>
                    </td>
                    <td>
                      <div className={styles.brandChips}>
                        {member.brandIds.length === 0 ? (
                          <span className={styles.noneChip}>no brand</span>
                        ) : (
                          member.brandIds.map((brandId) => (
                            <span key={brandId} className={styles.brandChip}>
                              {brandById.get(brandId)?.name ?? brandId}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.footnote}>
        Roster details mirror the Notion Team Directory and Airtable Booking Managers — edit those sources, then
        re-run the reference sync.
      </p>
    </div>
  );
}
