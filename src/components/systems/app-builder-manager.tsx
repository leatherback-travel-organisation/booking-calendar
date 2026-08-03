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
  const [pending, startTransition] = useTransition();

  function onGenerate(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setFreshCode(null);
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

  return (
    <section className={styles.wrap} aria-labelledby="app-builder-heading">
      <header className={styles.header}>
        <h1 id="app-builder-heading">App Builder invitations</h1>
        <p>
          Generate a one-time code and hand it to the person who should build an app. A code
          unlocks the guided app-building workflow once, expires automatically, and can be
          revoked here before it is used.
        </p>
      </header>

      <form className={styles.form} onSubmit={onGenerate}>
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
        <label className={styles.field}>
          <span>Expires in</span>
          <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>
        <button type="submit" disabled={pending || label.trim().length === 0}>
          {pending ? "Working…" : "Generate code"}
        </button>
      </form>

      {freshCode && (
        <div className={styles.freshCode} role="status">
          <strong>{freshCode}</strong>
          <span>Copy this code now — it is shown only once and never stored.</span>
        </div>
      )}
      {message && !freshCode && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}

      <table className={styles.table}>
        <caption className={styles.caption}>Newest 200 invitation codes</caption>
        <thead>
          <tr>
            <th scope="col">For</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col">Expires</th>
            <th scope="col">Redeemed</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {codes.length === 0 && (
            <tr>
              <td colSpan={6}>No invitation codes yet.</td>
            </tr>
          )}
          {codes.map((code) => (
            <tr key={code.id}>
              <td>
                {code.label}
                <span className={styles.byline}>by {code.createdByName}</span>
              </td>
              <td>
                <span className={styles.status} data-status={code.status}>
                  {STATUS_LABEL[code.status]}
                </span>
              </td>
              <td>{formatDate(code.createdAt)}</td>
              <td>{formatDate(code.expiresAt)}</td>
              <td>{code.redeemedAt ? `${formatDate(code.redeemedAt)} — ${code.redeemedByName ?? "unknown"}` : "—"}</td>
              <td>
                {code.status === "active" ? (
                  <button type="button" className={styles.revoke} disabled={pending} onClick={() => onRevoke(code.id)}>
                    Revoke
                  </button>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
