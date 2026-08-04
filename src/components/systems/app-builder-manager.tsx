"use client";

import { useState, useTransition } from "react";
import { generateBuilderCode, revokeBuilderCode } from "@/lib/systems/builder-actions";
import type { BuilderCode } from "@/lib/systems/builder-codes";
import styles from "./app-builder-manager.module.css";

const STATUS_LABEL: Record<BuilderCode["status"], string> = {
  active: "Active",
  redeemed: "Redeemed",
  revoked: "Revoked",
  expired: "Expired",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function AppBuilderManager({ codes }: { codes: readonly BuilderCode[] }) {
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [message, setMessage] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const activeCount = codes.filter((code) => code.status === "active").length;
  const redeemedCount = codes.filter((code) => code.status === "redeemed").length;

  function onGenerate(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setFreshCode(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateBuilderCode({ requestId: crypto.randomUUID(), label, expiresInDays });
      setMessage(result.message);
      if (result.ok && "plainCode" in result) {
        setFreshCode(result.plainCode);
        setLabel("");
      }
    });
  }

  function onRevoke(codeId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeBuilderCode({ requestId: crypto.randomUUID(), codeId });
      setMessage(result.message);
    });
  }

  async function onCopy() {
    if (!freshCode) return;
    try {
      await navigator.clipboard.writeText(freshCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="app-builder-heading">
      <header className={styles.hero}>
        <div className={styles.heroLead}>
          <span className={styles.kicker}>SuperPanel · App Builder</span>
          <h1 id="app-builder-heading">Build-an-app invitations</h1>
          <p>
            One code, one builder, one app. Codes unlock the guided app-building workflow once,
            expire automatically, and can be revoked before they are used.
          </p>
        </div>
        <div className={styles.heroSummary}>
          <span>
            <strong>{activeCount}</strong>
            Active
          </span>
          <span>
            <strong>{redeemedCount}</strong>
            Redeemed
          </span>
        </div>
      </header>

      <form className={styles.composer} onSubmit={onGenerate}>
        <label className={styles.field}>
          <span>Who or what is this code for?</span>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Jamie — retreats planning app"
            maxLength={120}
            required
          />
        </label>
        <label className={styles.fieldCompact}>
          <span>Expires in</span>
          <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <button type="submit" className={styles.primary} disabled={pending || label.trim().length === 0}>
          {pending ? "Working…" : "Generate code"}
        </button>
      </form>

      {freshCode && (
        <div className={styles.freshCode} role="status">
          <div>
            <strong>{freshCode}</strong>
            <span>Copy this code now — it is shown only once and never stored.</span>
          </div>
          <button type="button" className={styles.copy} onClick={onCopy}>
            {copied ? "Copied ✓" : "Copy code"}
          </button>
        </div>
      )}
      {message && !freshCode && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}

      <div className={styles.registry}>
        <header>
          <h2>Invitation codes</h2>
          <span>Newest {Math.min(codes.length, 200)} shown</span>
        </header>
        <div className={styles.listHead} aria-hidden="true">
          <span>For</span>
          <span>Status</span>
          <span>Created</span>
          <span>Expires</span>
          <span>Redeemed</span>
          <span />
        </div>
        {codes.length === 0 && <p className={styles.empty}>No invitation codes yet. Generate the first one above.</p>}
        {codes.map((code) => (
          <div className={styles.row} key={code.id}>
            <span className={styles.rowLead}>
              <strong>{code.label}</strong>
              <small>by {code.createdByName}</small>
            </span>
            <span>
              <i className={styles.status} data-status={code.status}>
                {STATUS_LABEL[code.status]}
              </i>
            </span>
            <span className={styles.rowDate}>{formatDate(code.createdAt)}</span>
            <span className={styles.rowDate}>{formatDate(code.expiresAt)}</span>
            <span className={styles.rowDate}>
              {code.redeemedAt ? `${formatDate(code.redeemedAt)} — ${code.redeemedByName ?? "unknown"}` : "—"}
            </span>
            <span className={styles.rowActions}>
              {code.status === "active" && (
                <button type="button" disabled={pending} onClick={() => onRevoke(code.id)}>
                  Revoke
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
