"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DataOrigin } from "@/lib/airtable/model";
import { editInjuryReport, submitInjuryReport } from "@/lib/injuries/actions";
import type { InjuryRecord, NewInjuryReport } from "@/lib/injuries/model";
import styles from "./injury-workspace.module.css";

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function InjuryIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m10 5 17 17a4 4 0 0 1-5.7 5.7L4.3 10.7A4 4 0 0 1 10 5Z" />
      <path d="m10 16 6-6M16 22l6-6M12.5 12.5l7 7M13 17h.1M17 13h.1M18.5 18.5h.1" />
    </svg>
  );
}

function emptyReport(): NewInjuryReport {
  return {
    dateOfInjury: "",
    nature: "",
    location: "",
    discussedWithManager: false,
    daysOff: 0,
    additionalInformation: "",
    bodilyLocation: "",
    equipmentDetails: "",
  };
}

function reportValues(record?: InjuryRecord): NewInjuryReport {
  if (!record) return emptyReport();
  return {
    dateOfInjury: record.dateOfInjury,
    nature: record.nature,
    location: record.location ?? "",
    discussedWithManager: record.discussedWithManager ?? false,
    daysOff: record.daysOff ?? 0,
    additionalInformation: record.additionalInformation ?? "",
    bodilyLocation: record.bodilyLocation ?? "",
    equipmentDetails: record.equipmentDetails ?? "",
  };
}

function ReportForm({
  record,
  onSaved,
  onCancel,
}: {
  record?: InjuryRecord;
  onSaved: (record: InjuryRecord, persisted: boolean, editing: boolean) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<NewInjuryReport>(() => reportValues(record));
  const editing = Boolean(record);

  function update<K extends keyof NewInjuryReport>(field: K, value: NewInjuryReport[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = record
          ? await editInjuryReport(record.id, values)
          : await submitInjuryReport(values);
        onSaved(result.record, result.persisted, editing);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `This report could not be ${editing ? "updated" : "submitted"}.`);
      }
    });
  }

  return (
    <form className={styles.reportForm} onSubmit={submit} id="injury-report-form">
      <header className={styles.formHeading}>
        <div><span className={styles.kicker}>{editing ? "Edit report" : "New report"}</span><h2>{editing ? "Update your injury report" : "Submit a new injury"}</h2></div>
        <button type="button" onClick={onCancel} aria-label="Close injury form">×</button>
        <p>{editing ? "Make any corrections below. The original submission date will remain unchanged." : "Your name and submission date are added automatically."}</p>
      </header>

      <div className={styles.formGrid}>
        <label>Date of injury<input required type="date" max={new Date().toISOString().slice(0, 10)} value={values.dateOfInjury} onChange={(event) => update("dateOfInjury", event.target.value)} /></label>
        <label>Location at the time<input value={values.location} maxLength={300} onChange={(event) => update("location", event.target.value)} placeholder="Where did this happen?" /></label>
        <label className={styles.fullField}>Nature of injury or illness<textarea required minLength={5} maxLength={1000} value={values.nature} onChange={(event) => update("nature", event.target.value)} placeholder="Describe what happened and the injury or symptoms…" /></label>
        <label>Bodily location or symptoms<input value={values.bodilyLocation} maxLength={500} onChange={(event) => update("bodilyLocation", event.target.value)} placeholder="For example: lower back, headache" /></label>
        <label>Number of days off<input type="number" min="0" max="365" step="1" value={values.daysOff} onChange={(event) => update("daysOff", Number(event.target.value))} /></label>
        <label className={styles.fullField}>Equipment, plant or substance involved<textarea maxLength={700} value={values.equipmentDetails} onChange={(event) => update("equipmentDetails", event.target.value)} placeholder="Leave blank if none" /></label>
        <label className={styles.fullField}>Additional information<textarea maxLength={1500} value={values.additionalInformation} onChange={(event) => update("additionalInformation", event.target.value)} placeholder="Add any follow-up, treatment or useful context…" /></label>
        <label className={styles.checkField}>
          <input type="checkbox" checked={values.discussedWithManager} onChange={(event) => update("discussedWithManager", event.target.checked)} />
          <span><strong>I have discussed this with my manager</strong><small>You can still submit if you have not done this yet.</small></span>
        </label>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      <footer className={styles.formActions}>
        <button className={styles.secondaryButton} type="button" onClick={onCancel}>Cancel</button>
        <button className={styles.submitButton} type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Submit injury report"}<span>→</span></button>
      </footer>
    </form>
  );
}

export function InjuryWorkspace({
  initialRecords,
  origin,
  employeeMatched,
  integrityIssues,
  displayName,
  canManage,
}: {
  initialRecords: InjuryRecord[];
  origin: DataOrigin;
  employeeMatched: boolean;
  integrityIssues: number;
  displayName: string;
  canManage: boolean;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<{ type: "new" } | { type: "edit"; id: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = records.find((record) => record.id === selectedId) ?? null;
  const editingRecord = formMode?.type === "edit" ? records.find((record) => record.id === formMode.id) : undefined;
  const firstName = displayName.split(/\s+/)[0] || displayName;

  function saveRecord(record: InjuryRecord, persisted: boolean, editing: boolean) {
    setRecords((current) => editing
      ? current.map((item) => item.id === record.id ? { ...record, employeeName: record.employeeName ?? item.employeeName, dateOfSubmission: record.dateOfSubmission || item.dateOfSubmission } : item)
      : [record, ...current]);
    setSelectedId(record.id);
    setFormMode(null);
    setNotice(persisted
      ? editing ? "Your changes were saved to Team Operations." : "Your report was submitted to Team Operations."
      : editing ? "Report updated for this private preview session." : "Report added to this private preview session.");
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.hero}>
        <div><span className={styles.kicker}>Health &amp; safety</span><h1>Mental health &amp; injury register</h1><p>Hi {firstName}. Review and update your previous reports, or submit a new injury when you need to.</p></div>
        <div className={styles.reportCount}><strong>{records.length}</strong><span>{records.length === 1 ? "report submitted" : "reports submitted"}</span></div>
      </header>

      <div className={styles.privacyStrip}><span className={styles.lockIcon}>✓</span><p><strong>Private to you and authorised managers.</strong> Reports are matched to your verified work identity.</p></div>
      {notice && <div className={styles.notice} role="status"><span>✓</span>{notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}
      {!employeeMatched && <div className={styles.warning}>Your work email is not matched to a Team Members record yet. Live submissions need that match.</div>}
      {integrityIssues > 0 && <div className={styles.warning} role="status">Cove omitted {integrityIssues} source {integrityIssues === 1 ? "report" : "reports"} because required dates or report details could not be verified. No substitute data was shown.</div>}

      <section className={styles.history} aria-labelledby="injury-history-title">
        <header className={styles.historyHeader}>
          <div><span className={`${styles.sourcePill} ${styles[origin]}`}>{origin === "airtable" ? "Live from Team Operations" : origin === "preview" ? "Private preview data" : "Team Operations unavailable"}</span><h2 id="injury-history-title">Your previous reports</h2><p>Select any report to review its details or make changes.</p></div>
          {canManage && <Link className={styles.adminLink} href="/admin/injuries">Manager view <span>→</span></Link>}
        </header>

        <div className={styles.recordList}>
          {records.map((record) => (
            <button type="button" className={selectedId === record.id ? styles.selected : ""} key={record.id} aria-expanded={selectedId === record.id} onClick={() => { setSelectedId(selectedId === record.id ? null : record.id); setFormMode(null); }}>
              <span className={styles.recordIcon}><InjuryIcon /></span>
              <span className={styles.recordCopy}><small>Report date · {formatDate(record.dateOfInjury)}</small><strong>{record.nature}</strong><em>Submitted {formatDate(record.dateOfSubmission)}</em></span>
              <span className={styles.rowArrow}>{selectedId === record.id ? "⌃" : "›"}</span>
            </button>
          ))}
          {records.length === 0 && <div className={styles.empty}><span>✓</span><h3>{integrityIssues > 0 ? "No verified reports available" : "No injuries reported"}</h3><p>{integrityIssues > 0 ? "Some source reports were omitted because their required data could not be verified." : "When you submit an injury, it will be listed here for you to review."}</p></div>}
        </div>

        {selected && (
          <article className={styles.detail}>
            <header><div><span className={styles.kicker}>Report details</span><h3>{selected.nature}</h3></div><button className={styles.editButton} type="button" onClick={() => setFormMode({ type: "edit", id: selected.id })}>Edit report</button></header>
            <dl>
              <div><dt>Report date</dt><dd>{formatDate(selected.dateOfInjury)}</dd></div>
              <div><dt>Submitted</dt><dd>{formatDate(selected.dateOfSubmission)}</dd></div>
              <div><dt>Location</dt><dd>{selected.location || "Not provided"}</dd></div>
              <div><dt>Manager discussed</dt><dd>{selected.discussedWithManager === undefined ? "Not recorded" : selected.discussedWithManager ? "Yes" : "No"}</dd></div>
              <div><dt>Days off</dt><dd>{selected.daysOff ?? "Not recorded"}</dd></div>
              {selected.bodilyLocation && <div className={styles.wide}><dt>Bodily location / symptoms</dt><dd>{selected.bodilyLocation}</dd></div>}
              {selected.equipmentDetails && <div className={styles.wide}><dt>Equipment or substance involved</dt><dd>{selected.equipmentDetails}</dd></div>}
              {selected.additionalInformation && <div className={styles.wide}><dt>Additional information</dt><dd>{selected.additionalInformation}</dd></div>}
            </dl>
          </article>
        )}

        <button className={styles.newReportButton} type="button" onClick={() => { setFormMode({ type: "new" }); setSelectedId(null); }}><span>＋</span><strong>Submit new injury</strong><small>Open a blank injury report</small><i>→</i></button>
      </section>

      {formMode && <ReportForm key={formMode.type === "edit" ? formMode.id : "new"} record={editingRecord} onSaved={saveRecord} onCancel={() => setFormMode(null)} />}
    </div>
  );
}
