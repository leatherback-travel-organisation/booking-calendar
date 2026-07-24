import type { VerifiedIdentity } from "@/lib/identity/types";
import type {
  PersonalDetailSectionKind,
  PersonalDetailsResult,
} from "@/lib/airtable/personal-details";
import { TEAM_MEMBER_EDITABLE_FIELDS } from "@/lib/airtable/personal-details";
import { parseIsoCalendarDate } from "@/lib/integrity/date";
import { PersonalDetailsEditor } from "./personal-details-editor";
import styles from "./personal-details.module.css";

function SectionIcon({ kind }: { kind: PersonalDetailSectionKind }) {
  if (kind === "personal") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19c.7-4.2 2.9-6.3 6.5-6.3s5.8 2.1 6.5 6.3"/></svg>;
  if (kind === "contact") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8 4.6 5.2c-1.2.7-.3 4.1 2 7.4s5.1 5.5 6.2 4.8l2.5-1.6-2.5-3.5-2 1.1c-.7-.5-1.5-1.4-2.3-2.5-.7-1-1.2-2-1.5-2.8l1.8-1.3-1.6-3Z"/><path d="M13.5 5.5h5v5M18.5 5.5l-6 6"/></svg>;
  if (kind === "address") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10.2c0 5.2-7 10.3-7 10.3s-7-5.1-7-10.3a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></svg>;
  if (kind === "emergency") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 9.3c0 5-8 10.1-8 10.1S4 14.3 4 9.3A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8 3.3Z"/><path d="M8.5 11.5h2l1-2.2 1.4 4 1-1.8h1.7"/></svg>;
  if (kind === "employment") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7" width="17" height="12.5" rx="2.2"/><path d="M8.5 7V4.5h7V7M3.5 12h17M10 12v2h4v-2"/></svg>;
  if (kind === "financial") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="13" rx="2.2"/><path d="M3.5 10h17M7 15h3M15.5 14v2"/></svg>;
  if (kind === "documents") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 16h6"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg>;
}

function displayValue(value: string) {
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1];
  const date = isoDate ? parseIsoCalendarDate(isoDate) : null;
  return date
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
        .toUpperCase()
    : value;
}

function sourceLabel(origin: PersonalDetailsResult["origin"]) {
  if (origin === "airtable") return "Live from Team Members";
  if (origin === "preview") return "Demonstration Team Members record";
  return "Team Members unavailable";
}

function statusCopy(state: PersonalDetailsResult["state"]) {
  if (state === "matched") return { value: "Linked", label: "Team Members record" };
  if (state === "unavailable") return { value: "Offline", label: "HR connection" };
  return { value: "Review", label: "Record match" };
}

export function PersonalDetails({
  identity,
  result,
}: {
  identity: VerifiedIdentity;
  result: PersonalDetailsResult;
}) {
  const profile = result.profile;
  const status = statusCopy(result.state);
  const fieldCount = profile?.sections.reduce((total, section) => total + section.entries.length, 0) ?? 0;
  const editableFields = new Set<string>(TEAM_MEMBER_EDITABLE_FIELDS);
  const editableSections = profile?.sections.flatMap((section) => {
    const entries = section.entries.filter((entry) => editableFields.has(entry.label));
    return entries.length ? [{ kind: section.kind, title: section.title, entries }] : [];
  }) ?? [];

  return (
    <div className={styles.page}>
      <header className="workspace-page-header">
        <div>
          <span className="section-kicker">Employee service</span>
          <h1>My Details</h1>
          <p>Your full Team Members record, securely matched to your work account.</p>
        </div>
        <div className="workspace-page-stat">
          <strong>{status.value}</strong>
          <span>{status.label}</span>
        </div>
      </header>

      <section className={`${styles.profilePanel} portal-data-panel`} aria-labelledby="profile-title">
        <div className={styles.profileIdentity}>
          <div className={styles.avatar} aria-hidden="true">{profile?.initials || identity.initials}</div>
          <div className={styles.profileCopy}>
            <span className={`source-pill source-${result.origin}`}>{sourceLabel(result.origin)}</span>
            <h2 id="profile-title">{profile?.name || identity.displayName}</h2>
            <p>{profile?.role || "Verified Leatherback employee"}</p>
          </div>
        </div>
        <div className={`${styles.connection} ${styles[result.state]}`}>
          <span className={styles.connectionMark} aria-hidden="true">{result.state === "matched" ? "✓" : "!"}</span>
          <div>
            <strong>
              {result.state === "matched"
                ? `${fieldCount} ${fieldCount === 1 ? "detail" : "details"} connected`
                : result.state === "unavailable"
                  ? "Team Members is temporarily unavailable"
                  : "Your Team Members record needs review"}
            </strong>
            <p>
              {result.state === "matched"
                ? "Cove found one current record with your verified work email."
                : result.state === "ambiguous"
                  ? "More than one current record uses your work email, so Cove has hidden the details."
                  : result.state === "not_found"
                    ? "No current Team Members record matches your verified work email yet."
                    : "Cove cannot safely read personal details until the connection recovers."}
            </p>
          </div>
        </div>
      </section>

      {result.integrityIssues > 0 ? (
        <div className="portal-integrity-warning" role="status">
          Cove omitted {result.integrityIssues} unsafe or unreadable {result.integrityIssues === 1 ? "value" : "values"}. Airtable record IDs and internal-only fields are never displayed.
        </div>
      ) : null}

      {profile ? (
        <section className={`${styles.recordPanel} portal-data-panel`} aria-labelledby="record-title">
          <header className="portal-data-heading">
            <div>
              <span className="source-pill">Team Members</span>
              <h2 id="record-title">Everything we have on file</h2>
            </div>
            <div className={styles.headingTools}>
              <p>{fieldCount} visible {fieldCount === 1 ? "field" : "fields"}</p>
              {result.origin === "airtable" && editableSections.length ? <PersonalDetailsEditor sections={editableSections} /> : null}
            </div>
          </header>

          {profile.sections.length ? (
            <div className={styles.recordSections}>
              {profile.sections.map((section) => (
                <section className={`${styles.recordSection} ${styles[`${section.kind}Section`]}`} aria-labelledby={`${section.kind}-details-title`} key={section.kind}>
                  <div className={`${styles.sectionIcon} ${styles[`${section.kind}Icon`]}`}><SectionIcon kind={section.kind}/></div>
                  <div className={styles.sectionBody}>
                    <div className={styles.sectionHeading}>
                      <div><span>{section.description}</span><h3 id={`${section.kind}-details-title`}>{section.title}</h3></div>
                      <small>{section.entries.length} {section.entries.length === 1 ? "field" : "fields"}</small>
                    </div>
                    <dl className={styles.definitionGrid}>
                      {section.entries.map((entry) => (
                        <div className={styles.detail} key={`${section.kind}-${entry.label}`}>
                          <dt>{entry.label}</dt>
                          <dd className={entry.value ? undefined : styles.missing}>{entry.value ? displayValue(entry.value) : "Not recorded"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.noFields}><strong>No readable personal fields</strong><span>The record is matched, but its detail fields are empty or use unsupported Airtable values.</span></div>
          )}

          <footer className={styles.updateNote}>
            <span aria-hidden="true">i</span>
            <p><strong>Something needs changing?</strong> Use Edit details for your contact, emergency, banking, tax and super information. People &amp; Operations still controls employment and document fields.</p>
          </footer>
        </section>
      ) : (
        <section className={`${styles.emptyPanel} portal-data-panel`} aria-labelledby="unavailable-title">
          <span className={styles.emptyIcon} aria-hidden="true"><SectionIcon kind="personal"/></span>
          <span className={styles.emptyKicker}>Team Members</span>
          <h2 id="unavailable-title">Your details are safely hidden</h2>
          <p>
            {result.state === "unavailable"
              ? "Try again later. Cove will never substitute demonstration data or another employee’s record when the live HR source is unavailable."
              : "People & Operations can correct the company email on your Team Members record. Once exactly one current record matches, all readable details will appear here automatically."}
          </p>
          <div className={styles.verifiedAccount}><span>Verified Cove account</span><strong>{identity.email}</strong></div>
        </section>
      )}
    </div>
  );
}
