import type { Brand, Staff } from "@/lib/booking/model";
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

function Presence({ present, label }: { present: boolean; label: string }) {
  return (
    <span
      className={present ? styles.tick : styles.dash}
      title={present ? `${label} id present` : `${label} id missing`}
      aria-label={present ? `${label} id present` : `${label} id missing`}
    >
      {present ? "✓" : "—"}
    </span>
  );
}

function rowFlags(member: Staff): string[] {
  const flags: string[] = [];
  if (!member.photoUrl) flags.push("no photo");
  if (member.brandIds.length === 0) flags.push("no brand mapping");
  if (!member.helpscoutUserId) flags.push("no Help Scout id");
  return flags;
}

type TeamRosterProps = {
  staff: Staff[];
  brands: Brand[];
  /** Last fetch time per reference cache key. */
  fetchedAt: Record<string, string | null>;
};

export function TeamRoster({ staff, brands, fetchedAt }: TeamRosterProps) {
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
                <th scope="col">Brands</th>
                <th scope="col" className={styles.center}>
                  Help Scout
                </th>
                <th scope="col" className={styles.center}>
                  Aircall
                </th>
                <th scope="col" className={styles.center}>
                  Slack
                </th>
                <th scope="col" className={styles.center}>
                  Calendar
                </th>
                <th scope="col" className={styles.center}>
                  Active
                </th>
                <th scope="col">Flags</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const flags = rowFlags(member);
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
                          <strong>{member.fullName}</strong>
                          <span>
                            {member.slug} · {member.email}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.brandChips}>
                        {member.brandIds.length === 0 ? (
                          <span className={styles.noneChip}>none</span>
                        ) : (
                          member.brandIds.map((brandId) => (
                            <span key={brandId} className={styles.brandChip}>
                              {brandById.get(brandId)?.name ?? brandId}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className={styles.center}>
                      <Presence present={Boolean(member.helpscoutUserId)} label="Help Scout" />
                    </td>
                    <td className={styles.center}>
                      <Presence present={Boolean(member.aircallUserId)} label="Aircall" />
                    </td>
                    <td className={styles.center}>
                      <Presence present={Boolean(member.slackUserId)} label="Slack" />
                    </td>
                    <td className={styles.center}>
                      <span className={member.calendarOk ? styles.tick : styles.warnMark}>
                        {member.calendarOk ? "✓" : "✗"}
                      </span>
                    </td>
                    <td className={styles.center}>
                      <span className={member.active ? styles.tick : styles.dash}>
                        {member.active ? "✓" : "—"}
                      </span>
                    </td>
                    <td>
                      {flags.length === 0 ? (
                        <span className={styles.dash}>{"—"}</span>
                      ) : (
                        <div className={styles.flagChips}>
                          {flags.map((flag) => (
                            <span key={flag} className={styles.flagChip}>
                              {flag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.footnote}>
        Read-only: this roster mirrors the Notion Team Directory and Airtable Booking Managers. Edit those sources,
        then re-run the reference sync.
      </p>
    </div>
  );
}
