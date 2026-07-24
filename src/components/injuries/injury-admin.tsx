"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DataOrigin } from "@/lib/airtable/model";
import type { InjuryRecord } from "@/lib/injuries/model";
import styles from "./injury-admin.module.css";

type Filter = "all" | "not_discussed" | "time_off";

function date(value: string) {
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function sourceLabel(origin: DataOrigin) {
  if (origin === "airtable") return "Live";
  if (origin === "preview") return "Preview";
  return "Unavailable";
}

export function InjuryAdmin({
  initialRecords,
  origin,
  integrityIssues,
}: {
  initialRecords: InjuryRecord[];
  origin: DataOrigin;
  integrityIssues: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = initialRecords.find((record) => record.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialRecords.filter((record) => {
      const matchesFilter = filter === "all"
        || (filter === "not_discussed" && record.discussedWithManager === false)
        || (filter === "time_off" && (record.daysOff ?? 0) > 0);
      const haystack = `${record.employeeName ?? ""} ${record.nature} ${record.location ?? ""} ${record.bodilyLocation ?? ""}`.toLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }, [filter, initialRecords, query]);

  const peopleCount = new Set(initialRecords.map((record) => record.employeeName).filter(Boolean)).size;
  const notDiscussed = initialRecords.filter((record) => record.discussedWithManager === false).length;
  const timeOff = initialRecords.reduce((total, record) => total + (record.daysOff ?? 0), 0);

  return (
    <div className={styles.workspace}>
      <header className={styles.adminHeader}>
        <div className={styles.titleRow}>
          <div><span className={styles.kicker}>Health &amp; safety administration</span><h1>Mental health &amp; injury register</h1><p>Review mental-health, personal-crisis and physical-injury reports together in one register.</p></div>
          <div className={styles.headerActions}><span className={styles.adminMode}><i />Manager view</span><Link href="/injuries">My reports</Link></div>
        </div>
        <nav className={styles.adminTabs} aria-label="Health register sections"><Link href="/admin/injuries" aria-current="page" className={styles.activeTab}>All reports</Link><Link href="/injuries">My reports</Link></nav>
      </header>

      <section className={styles.metricGrid} aria-label="Health register summary">
        <article><span>Total reports</span><strong>{initialRecords.length}</strong><small>Mental health and physical injury</small></article>
        <article><span>People reporting</span><strong>{peopleCount}</strong><small>Team members with a report</small></article>
        <article className={notDiscussed > 0 ? styles.attentionMetric : ""}><span>Not discussed</span><strong>{notDiscussed}</strong><small>Marked as not yet discussed with a manager</small></article>
        <article className={styles.sourceMetric}><span>Days off recorded</span><strong>{timeOff}</strong><small>{sourceLabel(origin)} Team Operations data</small></article>
      </section>

      {integrityIssues > 0 && <div className={styles.integrityWarning} role="status">Cove omitted {integrityIssues} source {integrityIssues === 1 ? "report" : "reports"} because required dates or report details could not be verified. Correct the source data before relying on the register total.</div>}

      <section className={styles.register} aria-labelledby="register-title">
        <header className={styles.registerHeader}><div><span className={styles.kicker}>Manager register</span><h2 id="register-title">Reported health matters</h2></div><span>{visible.length} of {initialRecords.length} reports</span></header>
        <div className={styles.toolbar}>
          <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Search health reports" placeholder="Search person, report or location…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className={styles.filters} aria-label="Filter health reports">{(["all", "not_discussed", "time_off"] as const).map((item) => <button type="button" aria-pressed={filter === item} className={filter === item ? styles.activeFilter : ""} key={item} onClick={() => setFilter(item)}>{item === "all" ? "All reports" : item === "not_discussed" ? "Not discussed" : "Time off"}</button>)}</div>
        </div>

        <div className={`${styles.registerLayout} ${selected ? styles.hasDetail : ""}`}>
          <div className={styles.tableWrap}>
            <div className={styles.tableHead}><span>Team member &amp; report</span><span>Report date</span><span>Manager</span><span>Days off</span><span /></div>
            {visible.map((record) => {
              const employeeName = record.employeeName || "Team member";
              return (
                <button type="button" className={`${styles.recordRow} ${selectedId === record.id ? styles.selectedRow : ""}`} key={record.id} aria-expanded={selectedId === record.id} aria-controls="selected-injury-report" onClick={() => setSelectedId(record.id)}>
                  <span className={styles.personCell}><i>{initials(employeeName)}</i><span><strong>{employeeName}</strong><small>{record.nature}</small></span></span>
                  <span className={styles.dateCell}><strong>{date(record.dateOfInjury)}</strong><small>Submitted {date(record.dateOfSubmission)}</small></span>
                  <span className={`${styles.discussionStatus} ${record.discussedWithManager ? styles.discussed : styles.notDiscussed}`}>{record.discussedWithManager === undefined ? "Not recorded" : record.discussedWithManager ? "Discussed" : "Not discussed"}</span>
                  <span className={styles.daysOff}>{record.daysOff ?? "—"}</span>
                  <span className={styles.arrow}>›</span>
                </button>
              );
            })}
            {visible.length === 0 && <div className={styles.empty}>{integrityIssues > 0 ? "No verified reports match this view. Some source reports were omitted." : "No health reports match this view."}</div>}
          </div>

          {selected && <ReportDetail record={selected} onClose={() => setSelectedId(null)} />}
        </div>
      </section>

      <div className={styles.privacyNote}><span>i</span><p><strong>Sensitive employee information.</strong> This cross-team register is restricted to people with Injury Reporting Admin access. Employee views remain limited to their own reports.</p></div>
    </div>
  );
}

function ReportDetail({ record, onClose }: { record: InjuryRecord; onClose: () => void }) {
  return (
    <aside id="selected-injury-report" className={styles.detailPanel} aria-label={`${record.employeeName || "Team member"} health report`}>
      <header><button type="button" onClick={onClose} aria-label="Close report details">×</button><span className={styles.kicker}>Health report</span><h3>{record.nature}</h3><p>{record.employeeName || "Team member"}<br />Submitted {date(record.dateOfSubmission)}</p></header>
      <dl>
        <div><dt>Report date</dt><dd>{date(record.dateOfInjury)}</dd></div>
        <div><dt>Location</dt><dd>{record.location || "Not provided"}</dd></div>
        <div><dt>Manager discussed</dt><dd>{record.discussedWithManager === undefined ? "Not recorded" : record.discussedWithManager ? "Yes" : "No"}</dd></div>
        <div><dt>Days off</dt><dd>{record.daysOff ?? "Not recorded"}</dd></div>
      </dl>
      {record.bodilyLocation && <section><span>Bodily location / symptoms</span><p>{record.bodilyLocation}</p></section>}
      {record.equipmentDetails && <section><span>Equipment or substance involved</span><p>{record.equipmentDetails}</p></section>}
      {record.additionalInformation && <section><span>Additional information</span><p>{record.additionalInformation}</p></section>}
    </aside>
  );
}
