"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { DataOrigin } from "@/lib/airtable/model";
import { reviewMoneyRequest } from "@/lib/money/actions";
import { moneyStatusTransitions, type MoneyKind, type MoneyRecord, type MoneyStatus } from "@/lib/money/model";
import styles from "./money-admin.module.css";

type Filter = "all" | MoneyKind | "attention";

const kindLabel: Record<MoneyKind, string> = { invoice: "Invoice", travel_credit: "Travel credit", reimbursement: "Reimbursement" };
const statusLabel: Record<MoneyStatus, string> = {
  draft: "Draft", submitted: "Submitted", in_review: "In review", action_required: "Action required",
  approved: "Approved", scheduled: "Scheduled", paid: "Paid", available: "Available", used: "Used", declined: "Declined",
};

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function AdminHeader() {
  return (
    <header className={styles.adminHeader}>
      <div className={styles.titleRow}>
        <div><span className={styles.kicker}>Cove administration</span><h1>Money operations</h1><p>Review invoices, travel credits and reimbursements from one finance queue.</p></div>
        <div className={styles.headerActions}><span className={styles.adminMode}><i />Admin mode</span><Link href="/money">View my money</Link></div>
      </div>
      <nav className={styles.adminTabs} aria-label="Administration sections"><Link href="/admin">People</Link><Link href="/admin?view=apps">Applications</Link><Link href="/admin/money" aria-current="page" className={styles.activeTab}>Money</Link></nav>
    </header>
  );
}

export function MoneyAdmin({ initialRecords, origin, integrityIssues }: { initialRecords: MoneyRecord[]; origin: DataOrigin; integrityIssues: number }) {
  const [records, setRecords] = useState(initialRecords);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = records.find((record) => record.id === selectedId) ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesFilter = filter === "all" || record.kind === filter || (filter === "attention" && ["submitted", "in_review", "action_required"].includes(record.status));
      return matchesFilter && (!needle || `${record.reference} ${record.title} ${record.employeeName} ${record.employeeEmail} ${record.counterparty ?? ""}`.toLowerCase().includes(needle));
    });
  }, [filter, query, records]);

  const reviewCount = records.filter((record) => ["submitted", "in_review", "action_required"].includes(record.status)).length;
  const actionCount = records.filter((record) => record.status === "action_required").length;
  const scheduledValue = records.filter((record) => record.currency === "USD" && ["approved", "scheduled"].includes(record.status)).reduce((sum, record) => sum + record.amount, 0);

  function updateRecord(record: MoneyRecord, persisted: boolean) {
    setRecords((current) => current.map((item) => item.id === record.id ? record : item));
    setNotice(persisted ? `${record.reference} was saved.` : `${record.reference} was updated for this preview session.`);
  }

  return (
    <div className={styles.workspace}>
      <AdminHeader />
      <section className={styles.metricGrid} aria-label="Money operations summary">
        <article><span>Open review queue</span><strong>{reviewCount}</strong><small>Across all three record types</small></article>
        <article><span>Action required</span><strong>{actionCount}</strong><small>Waiting on an employee</small></article>
        <article className={styles.valueMetric}><span>Approved or scheduled</span><strong>{money(scheduledValue, "USD")}</strong><small>USD value moving to payment</small></article>
        <article className={styles.sourceMetric}><span>Data source</span><strong>{origin === "airtable" || origin === "database" ? "Live" : origin === "preview" ? "Preview" : "Unavailable"}</strong><small>{origin === "airtable" ? "Leatherback HR & Team Operations" : origin === "database" ? "Secure Cove submissions" : origin === "preview" ? "Synthetic records only" : "No operational records were substituted"}</small></article>
      </section>

      {notice && <div className={styles.notice} role="status"><span />{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}
      {integrityIssues > 0 && <div className={styles.integrityWarning} role="status">Cove omitted {integrityIssues} source {integrityIssues === 1 ? "record" : "records"} because the status, amount, currency, dates, or attachment could not be verified. Correct the source data before reviewing those records.</div>}

      <section className={styles.queue} aria-labelledby="queue-title">
        <header className={styles.queueHeader}><div><span className={styles.kicker}>Finance queue</span><h2 id="queue-title">All money records</h2></div><span>{visible.length} of {records.length} records</span></header>
        <div className={styles.toolbar}>
          <label className={styles.search}><span>⌕</span><input type="search" aria-label="Search money records" placeholder="Search person, reference or vendor…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className={styles.filters} aria-label="Filter records">{(["all", "attention", "invoice", "travel_credit", "reimbursement"] as const).map((item) => <button type="button" aria-pressed={filter === item} className={filter === item ? styles.activeFilter : ""} key={item} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "attention" ? "Needs review" : `${kindLabel[item]}s`}</button>)}</div>
        </div>

        <div className={`${styles.queueLayout} ${selected ? styles.hasDetail : ""}`}>
          <div className={styles.tableWrap}>
            <div className={styles.tableHead}><span>Employee & record</span><span>Type</span><span>Status</span><span>Updated</span><span>Amount</span><span /></div>
            {visible.map((record) => (
              <button type="button" className={`${styles.recordRow} ${selectedId === record.id ? styles.selectedRow : ""}`} key={record.id} aria-expanded={selectedId === record.id} aria-controls="selected-money-review" onClick={() => setSelectedId(record.id)}>
                <span className={styles.personCell}><i>{initials(record.employeeName)}</i><span><strong>{record.employeeName}</strong><small>{record.title} · {record.reference}</small></span></span>
                <span className={`${styles.kind} ${styles[record.kind]}`}>{kindLabel[record.kind]}</span>
                <span className={`${styles.status} ${styles[record.status]}`}>{statusLabel[record.status]}</span>
                <span className={styles.dateCell}><strong>{date(record.updatedAt)}</strong><small>{record.employeeEmail}</small></span>
                <span className={styles.amount}>{money(record.amount, record.currency)}</span>
                <span className={styles.arrow}>›</span>
              </button>
            ))}
            {visible.length === 0 && <div className={styles.empty}>{integrityIssues > 0 ? "No verified records match this queue. Some source rows were omitted." : "No records match this queue."}</div>}
          </div>

          {selected && <ReviewPanel key={selected.id} record={selected} onClose={() => setSelectedId(null)} onUpdated={updateRecord} />}
        </div>
      </section>
      <div className={styles.auditNote}><span>i</span><p><strong>Employee privacy remains enforced.</strong> This cross-team view is available only to SuperPanel and access administrators. Employee views are filtered by verified email.</p></div>
    </div>
  );
}

function ReviewPanel({ record, onClose, onUpdated }: { record: MoneyRecord; onClose: () => void; onUpdated: (record: MoneyRecord, persisted: boolean) => void }) {
  const [status, setStatus] = useState<MoneyStatus>(record.status);
  const [note, setNote] = useState(record.adminNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await reviewMoneyRequest({ id: record.id, kind: record.kind, status: record.status, updatedAt: record.updatedAt }, status, note);
        onUpdated(result.record, result.persisted);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The review could not be saved.");
      }
    });
  }

  return (
    <aside id="selected-money-review" className={styles.reviewPanel} aria-label={`${record.reference} review`}>
      <header><button type="button" onClick={onClose} aria-label="Close review">×</button><span className={styles.kicker}>{kindLabel[record.kind]}</span><h3>{record.title}</h3><p>{record.employeeName}<br />{record.employeeEmail}</p></header>
      <div className={styles.amountBlock}><span>{record.reference}</span><strong>{money(record.amount, record.currency)}</strong><small>Submitted {date(record.submittedAt)}</small></div>
      <dl><div><dt>Vendor / party</dt><dd>{record.counterparty ?? "—"}</dd></div><div><dt>Category</dt><dd>{record.category ?? "—"}</dd></div><div><dt>Transaction date</dt><dd>{record.transactionDate ? date(record.transactionDate) : "—"}</dd></div></dl>
      {record.description && <div className={styles.description}><span>Employee details</span><p>{record.description}</p></div>}
      <div className={styles.reviewForm}>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as MoneyStatus)}><option value={record.status}>{statusLabel[record.status]}</option>{moneyStatusTransitions[record.kind][record.status].map((item) => <option value={item} key={item}>{statusLabel[item]}</option>)}</select></label>
        <label>Note to employee<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="Explain what changed or what is needed…" /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save review"}</button>
      </div>
    </aside>
  );
}
