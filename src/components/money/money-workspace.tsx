"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { DataOrigin } from "@/lib/airtable/model";
import type { ExtractedInvoice } from "@/lib/money/invoice-extraction";
import type { MoneyKind, MoneyRecord, NewMoneyRequest } from "@/lib/money/model";
import styles from "./money-workspace.module.css";

type ComposeKind = Extract<NewMoneyRequest["kind"], "invoice" | "reimbursement">;

const kindCopy: Record<MoneyKind, { label: string; singular: string; history: string }> = {
  invoice: { label: "Invoices", singular: "Invoice", history: "Invoice history" },
  reimbursement: { label: "Reimbursements", singular: "Reimbursement", history: "Reimbursement history" },
  travel_credit: { label: "Travel Credits", singular: "Trip", history: "Travel credit history" },
};

function MoneyGlyph({ kind }: { kind: MoneyKind }) {
  if (kind === "travel_credit") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 11h22v15H5zM8 7h16v4M5 17h22M10 22h5" /><path d="m22 20 1.2 2.4 2.8.4-2 2 .5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-2 2.8-.4L22 20Z" /></svg>;
  if (kind === "reimbursement") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 3h14v26l-3.5-2-3.5 2-3.5-2L9 29V3Z" /><path d="M13 10h6M13 15h6M13 20h4" /><path d="m24 8 4 4-4 4M28 12h-7" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h13l5 5v21H8V3ZM21 3v6h5" /><path d="M17 12v12M20.5 15c-.7-1-1.8-1.5-3.5-1.5-2 0-3 1-3 2.5 0 3.7 7 1.3 7 5 0 1.7-1.3 2.7-3.7 2.7-1.6 0-2.9-.5-3.8-1.5" /></svg>;
}

function FileGlyph() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3h11l6 6v20H8V3Zm11 0v7h6M16.5 23V13m-4 4 4-4 4 4" /></svg>;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function sourceLabel(origin: DataOrigin) {
  if (origin === "airtable") return "Live finance records";
  if (origin === "database") return "Live Cove records";
  if (origin === "preview") return "Private preview data";
  return "Records unavailable";
}

function RequestForm({ kind, onCreated }: { kind: ComposeKind; onCreated: (record: MoneyRecord, persisted: boolean) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"upload" | "extracting" | "review">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState(kind === "invoice" ? "Contractor services" : "");
  const [transactionDate, setTransactionDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  async function chooseFile(nextFile?: File) {
    setError(null);
    if (!nextFile) return;
    const isPdf = nextFile.type === "application/pdf" || nextFile.name.toLowerCase().endsWith(".pdf");
    const isAccepted = isPdf || (kind === "reimbursement" && ["image/jpeg", "image/png"].includes(nextFile.type));
    if (!isAccepted) {
      setError(kind === "invoice" ? "Choose a PDF invoice." : "Choose a PDF, JPG, or PNG receipt.");
      return;
    }
    if (nextFile.size === 0 || nextFile.size > 5_000_000) {
      setError("Choose a file smaller than 5 MB.");
      return;
    }

    setFile(nextFile);
    if (kind === "reimbursement") {
      setTitle(nextFile.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
      setPhase("review");
      return;
    }

    setPhase("extracting");
    try {
      const body = new FormData();
      body.append("file", nextFile);
      const response = await fetch("/api/money/extract", { method: "POST", body });
      const result = await response.json() as { fields?: ExtractedInvoice; error?: string };
      if (!response.ok || !result.fields) throw new Error(result.error || "We couldn’t read that invoice.");
      setTitle(result.fields.title);
      setInvoiceNumber(result.fields.invoiceNumber);
      setAmount(result.fields.amount?.toString() ?? "");
      setCurrency(result.fields.currency);
      setCounterparty(result.fields.counterparty);
      setTransactionDate(result.fields.transactionDate);
      setDueDate(result.fields.dueDate);
      setDescription(result.fields.invoiceNumber ? `Supplier invoice ${result.fields.invoiceNumber}` : "Supplier invoice for completed work");
      setPhase("review");
    } catch (cause) {
      setFile(null);
      setPhase("upload");
      setError(cause instanceof Error ? cause.message : "We couldn’t read that invoice.");
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Attach your document before submitting.");
      return;
    }
    startTransition(async () => {
      try {
        const body = new FormData();
        body.append("file", file);
        Object.entries({ kind, title, description, amount, currency, counterparty, category, transactionDate, dueDate, invoiceNumber }).forEach(([key, value]) => body.append(key, value));
        const response = await fetch("/api/money/submit", { method: "POST", body });
        const result = await response.json() as { record?: MoneyRecord; persisted?: boolean; error?: string };
        if (!response.ok || !result.record || result.persisted === undefined) throw new Error(result.error || "This request could not be submitted.");
        onCreated({ ...result.record, attachmentUrl: result.record.attachmentUrl ?? URL.createObjectURL(file) }, result.persisted);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This request could not be submitted.");
      }
    });
  }

  return (
    <section className={styles.actionPanel} aria-labelledby="request-title">
      <div className={styles.actionIntro}>
        <span className={styles.kicker}>{kind === "invoice" ? "For completed work" : "For a company expense"}</span>
        <h2 id="request-title">{kind === "invoice" ? "Upload an invoice" : "Add a reimbursement"}</h2>
        <p>{kind === "invoice" ? "Upload your PDF and Cove will extract the details for you." : "Upload the receipt, then add the essential expense details."}</p>
      </div>

      {phase !== "review" ? (
        <div className={styles.uploadArea} aria-live="polite">
          {phase === "extracting" ? <><span className={styles.processingMark}><FileGlyph /></span><strong>Reading your invoice…</strong><p>Finding the supplier, dates and total.</p></> : <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0]); }}><input type="file" accept={kind === "invoice" ? ".pdf,application/pdf" : ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"} onChange={(event) => void chooseFile(event.target.files?.[0])} /><span className={styles.uploadGlyph}><FileGlyph /></span><span><strong>{kind === "invoice" ? "Choose invoice" : "Choose receipt"}</strong><p>Drop it here or browse · {kind === "invoice" ? "PDF" : "PDF, JPG or PNG"} · 5 MB max</p></span></label>}
        </div>
      ) : (
        <form className={styles.requestForm} onSubmit={submit}>
          <div className={styles.reviewHeading}><span className={styles.successMark}>✓</span><div><h3>{kind === "invoice" ? "Does everything look correct?" : "Add the expense details"}</h3><p>{kind === "invoice" ? "Correct anything Cove misread, then submit." : "These details will be saved with your receipt."}</p></div></div>
          <div className={styles.fileSummary}><span><FileGlyph /></span><div><strong>{file?.name}</strong><small>{file ? `${(file.size / 1_000_000).toFixed(1)} MB` : ""}</small></div><button type="button" onClick={() => { setFile(null); setPhase("upload"); setError(null); }}>Replace</button></div>
          <label className={styles.wideField}>{kind === "invoice" ? "Title" : "What was this for?"}<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "invoice" ? "Invoice title" : "e.g. Airport transfer"} /></label>
          <label>{kind === "invoice" ? "Invoice from" : "Vendor"}<input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} placeholder="Company or supplier" /></label>
          {kind === "invoice" && <label>Invoice number<input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="e.g. INV-1048" /></label>}
          <label>Amount<span className={styles.amountInput}><select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>{["USD", "EUR", "GBP", "ZAR", "BWP", "KES", "TZS", "UGX"].map((item) => <option key={item}>{item}</option>)}</select><input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></span></label>
          <label>{kind === "invoice" ? "Invoice date" : "Expense date"}<input type="date" max={new Date().toISOString().slice(0, 10)} value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></label>
          {kind === "invoice" ? <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label> : <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Ground transport" /></label>}
          {kind === "reimbursement" && <label className={styles.wideField}>Note<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" /></label>}
          {error && <p className={styles.formError} role="alert">{error}</p>}
          <div className={styles.formActions}><button type="submit" className={styles.primaryButton} disabled={pending}>{pending ? "Submitting…" : kind === "invoice" ? "Submit invoice" : "Submit reimbursement"}</button></div>
        </form>
      )}
      {error && phase !== "review" && <p className={styles.uploadError} role="alert">{error}</p>}
    </section>
  );
}

function TravelRequestForm({ onCreated }: { onCreated: (record: MoneyRecord, persisted: boolean) => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [purpose, setPurpose] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const body = new FormData();
        Object.entries({
          kind: "travel_credit",
          title: `Trip to ${destination}`,
          description: purpose,
          amount,
          currency,
          counterparty: destination,
          category: "Trip request",
          transactionDate: travelDate,
        }).forEach(([key, value]) => body.append(key, value));
        const response = await fetch("/api/money/submit", { method: "POST", body });
        const result = await response.json() as { record?: MoneyRecord; persisted?: boolean; error?: string };
        if (!response.ok || !result.record || result.persisted === undefined) throw new Error(result.error || "This trip could not be submitted.");
        onCreated(result.record, result.persisted);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This trip could not be submitted.");
      }
    });
  }

  return (
    <form className={styles.tripForm} onSubmit={submit}>
      <div className={styles.tripFormIntro}><span className={styles.kicker}>Plan travel</span><h2>Submit a new trip</h2><p>Tell Cove where you’re going and the expected cost.</p></div>
      <label>Destination<input required minLength={2} maxLength={120} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="e.g. Cape Town" /></label>
      <label>Travel date<input required type="date" min={new Date().toISOString().slice(0, 10)} value={travelDate} onChange={(event) => setTravelDate(event.target.value)} /></label>
      <label>Estimated cost<span className={styles.amountInput}><select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>{["USD", "EUR", "GBP", "ZAR", "BWP", "KES", "TZS", "UGX"].map((item) => <option key={item}>{item}</option>)}</select><input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></span></label>
      <label>Purpose<input required minLength={3} maxLength={240} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Why are you travelling?" /></label>
      {error && <p className={styles.formError} role="alert">{error}</p>}
      <div className={styles.formActions}><button type="submit" className={styles.primaryButton} disabled={pending}>{pending ? "Submitting…" : "Submit trip"}</button></div>
    </form>
  );
}

export function MoneyWorkspace({
  initialRecords,
  origin,
  displayName,
  canManage,
  initialView,
}: {
  initialRecords: MoneyRecord[];
  origin: DataOrigin;
  displayName: string;
  canManage: boolean;
  initialView?: string;
}) {
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const activeKind: MoneyKind = initialView === "reimbursements" || initialView === "reimbursement"
    ? "reimbursement"
    : initialView === "travel-credits" || initialView === "travel_credit"
      ? "travel_credit"
      : "invoice";

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => record.kind === activeKind && (!needle || `${record.reference} ${record.title} ${record.counterparty ?? ""} ${record.category ?? ""}`.toLowerCase().includes(needle)));
  }, [activeKind, query, records]);
  const selected = records.find((record) => record.id === selectedId && record.kind === activeKind) ?? null;
  const creditBalance = records.filter((record) => record.kind === "travel_credit" && record.currency === "USD" && record.status === "available").reduce((total, record) => total + record.amount, 0);

  function addRecord(record: MoneyRecord, persisted: boolean) {
    setRecords((current) => [record, ...current]);
    setSelectedId(record.id);
    const label = record.kind === "travel_credit" ? "trip" : record.kind;
    setNotice(persisted ? `Your ${label} was submitted.` : `Your ${label} was added to this preview session.`);
  }

  return (
    <div className={styles.moneyWorkspace}>
      <header className={styles.pageHeader}>
        <div><span className={styles.kicker}>Your money</span><h1>Money</h1><p>Hi {firstName}. Submit documents, plan travel and view your history.</p></div>
        {canManage && <Link className={styles.adminLink} href="/admin/money">Admin view</Link>}
      </header>

      <nav className={styles.sectionNav} aria-label="Money sections">
        {([
          ["invoice", "invoices", "Upload invoices and view history"],
          ["reimbursement", "reimbursements", "Add expenses and view history"],
          ["travel_credit", "travel-credits", "Balance, trips and history"],
        ] as const).map(([kind, slug, description]) => (
          <Link href={`/money?view=${slug}`} key={kind} aria-current={activeKind === kind ? "page" : undefined} className={activeKind === kind ? styles.activeSection : ""}>
            <span className={`${styles.navGlyph} ${styles[kind]}`}><MoneyGlyph kind={kind} /></span>
            <span><strong>{kindCopy[kind].label}</strong><small>{description}</small></span>
          </Link>
        ))}
      </nav>

      {notice && <div className={styles.notice} role="status"><span />{notice}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}

      {activeKind === "travel_credit" ? (
        <section className={styles.travelWorkspace} aria-label="Travel credits">
          <article className={styles.balanceCard}><span>Available travel credit</span><strong>{formatMoney(creditBalance, "USD")}</strong><p>Ready to use toward company travel.</p></article>
          <TravelRequestForm onCreated={addRecord} />
        </section>
      ) : <RequestForm key={activeKind} kind={activeKind} onCreated={addRecord} />}

      <section className={styles.ledger} aria-labelledby="ledger-title">
        <header className={styles.ledgerHeader}>
          <div><span className={styles.sourcePill}>{sourceLabel(origin)}</span><h2 id="ledger-title">{kindCopy[activeKind].history}</h2><p>{visibleRecords.length} {visibleRecords.length === 1 ? "record" : "records"}</p></div>
          <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${kindCopy[activeKind].label.toLowerCase()}…`} aria-label={`Search ${kindCopy[activeKind].label.toLowerCase()}`} /></label>
        </header>

        <div className={`${styles.recordLayout} ${selected ? styles.hasDetail : ""}`}>
          <div className={styles.recordList}>
            {visibleRecords.map((record) => (
              <button type="button" className={`${styles.recordRow} ${selectedId === record.id ? styles.selectedRow : ""}`} key={record.id} onClick={() => setSelectedId(record.id)}>
                <span className={`${styles.recordGlyph} ${styles[record.kind]}`}><MoneyGlyph kind={record.kind} /></span>
                <span className={styles.recordTitle}><small>{record.reference}</small><strong>{record.title}</strong><em>{formatDate(record.submittedAt)}</em></span>
                <span className={styles.recordAmount}><strong>{formatMoney(record.amount, record.currency)}</strong><small>{record.category ?? kindCopy[record.kind].singular}</small></span>
                <span className={styles.rowArrow}>›</span>
              </button>
            ))}
            {visibleRecords.length === 0 && <div className={styles.emptyState}><span className={`${styles.navGlyph} ${styles[activeKind]}`}><MoneyGlyph kind={activeKind} /></span><h3>No {kindCopy[activeKind].label.toLowerCase()} yet</h3><p>{activeKind === "invoice" ? "Upload your first invoice above." : activeKind === "reimbursement" ? "Add your first reimbursement above." : "Submit a trip above when you’re ready to travel."}</p></div>}
          </div>

          {selected && (
            <aside className={styles.detailPanel} aria-label={`${selected.reference} details`}>
              <header><span className={`${styles.detailGlyph} ${styles[selected.kind]}`}><MoneyGlyph kind={selected.kind} /></span><button type="button" aria-label="Close record details" onClick={() => setSelectedId(null)}>×</button><small>{kindCopy[selected.kind].singular}</small><h3>{selected.title}</h3></header>
              <div className={styles.detailAmount}><span>Amount</span><strong>{formatMoney(selected.amount, selected.currency)}</strong></div>
              <dl>
                <div><dt>Reference</dt><dd>{selected.reference}</dd></div>
                <div><dt>Added</dt><dd>{formatDate(selected.submittedAt)}</dd></div>
                {selected.transactionDate && <div><dt>{selected.kind === "travel_credit" ? "Travel date" : selected.kind === "invoice" ? "Invoice date" : "Expense date"}</dt><dd>{formatDate(selected.transactionDate)}</dd></div>}
                {selected.dueDate && selected.kind === "invoice" && <div><dt>Due date</dt><dd>{formatDate(selected.dueDate)}</dd></div>}
                {selected.counterparty && <div><dt>{selected.kind === "travel_credit" ? "Destination" : "Vendor / party"}</dt><dd>{selected.counterparty}</dd></div>}
                {selected.description && <div className={styles.fullDetail}><dt>Details</dt><dd>{selected.description}</dd></div>}
              </dl>
              {selected.attachmentUrl && <a className={styles.attachmentLink} href={selected.attachmentUrl} target="_blank" rel="noreferrer">Open attachment ↗</a>}
            </aside>
          )}
        </div>
      </section>
      <p className={styles.privacyNote}><span>●</span> This private view is matched to your verified work email.</p>
    </div>
  );
}
