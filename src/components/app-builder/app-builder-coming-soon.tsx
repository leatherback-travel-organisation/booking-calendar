"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { APP_BUILDER_MAX_PDF_BYTES, type AppBuilderRequest, type AppBuilderTarget } from "@/lib/app-builder/model";
import styles from "./app-builder-coming-soon.module.css";

const active = new Set(["queued", "reading", "waiting_openai", "making_changes", "preparing_review", "needs_approval", "publishing", "reversing"]);
const ALL_UPDATES = "__all_updates__";
const labels: Record<AppBuilderRequest["status"], string> = {
  queued: "Queued", reading: "Reading brief", waiting_openai: "Thinking",
  making_changes: "Making changes", preparing_review: "Preparing release",
  needs_approval: "Publishing", publishing: "Publishing", live: "Live",
  reversing: "Reversing", reversed: "Reversed", failed: "Stopped",
};

function Mark({ type }: { type: "spark" | "file" | "check" | "arrow" }) {
  if (type === "file") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l4 4v15H6zM14 2.5v5h4M9 13h6M9 17h4"/></svg>;
  if (type === "check") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>;
  if (type === "arrow") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/></svg>;
}

export function AppBuilderComingSoon({ targets, requests, allRequests, engineReady }: { targets: AppBuilderTarget[]; requests: AppBuilderRequest[]; allRequests?: AppBuilderRequest[]; engineReady: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const dragDepth = useRef(0);
  const canSeeOverall = allRequests !== undefined;
  const [selectedId, setSelectedId] = useState(canSeeOverall ? ALL_UPDATES : targets[0]?.id ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draggingBrief, setDraggingBrief] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reversingId, setReversingId] = useState("");
  const [message, setMessage] = useState("");
  const showingOverall = canSeeOverall && selectedId === ALL_UPDATES;
  const selected = targets.find((target) => target.id === selectedId);
  const selectedRequests = useMemo(() => requests.filter((request) => request.targetApplicationId === selectedId), [requests, selectedId]);
  const visibleActivity = allRequests ?? requests;
  const hasActive = visibleActivity.some((request) => active.has(request.status));

  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(async () => {
      await fetch("/api/app-builder/reconcile", { method: "POST" }).catch(() => undefined);
      router.refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [hasActive, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setUploadProgress(0); setMessage("");
    try {
      if (!selectedFile) throw new Error("Choose or drop a PDF brief to continue.");
      const fields = new FormData(event.currentTarget);
      const blob = await upload(`app-builder/${crypto.randomUUID()}.pdf`, selectedFile, {
        access: "private",
        handleUploadUrl: "/api/app-builder/uploads",
        clientPayload: JSON.stringify({ targetId: selectedId }),
        multipart: selectedFile.size > 10 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      });
      const response = await fetch("/api/app-builder/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selectedId, notes: String(fields.get("notes") ?? ""), blobUrl: blob.url, filename: selectedFile.name }),
      });
      const result = response.headers.get("content-type")?.includes("application/json")
        ? await response.json().catch(() => ({})) as { error?: string }
        : {};
      if (!response.ok) {
        if (response.status === 413) throw new Error("This PDF is larger than 200 MB.");
        throw new Error(result.error ?? `Cove could not accept the upload (HTTP ${response.status}).`);
      }
      setMessage("Brief received. Cove is preparing and publishing the protected update.");
      setSelectedFile(null); form.current?.reset(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be started."); }
    finally { setSubmitting(false); setUploadProgress(0); }
  }

  function chooseBrief(file?: File) {
    setMessage("");
    if (!file) { setSelectedFile(null); return; }
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      setSelectedFile(null); setMessage("Drop a PDF file to continue."); return;
    }
    if (file.size > APP_BUILDER_MAX_PDF_BYTES) {
      setSelectedFile(null); setMessage("This PDF is larger than 200 MB."); return;
    }
    setSelectedFile(file);
  }

  function dragEnter(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!engineReady || submitting) return;
    dragDepth.current += 1;
    setDraggingBrief(true);
  }

  function dragLeave(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDraggingBrief(false);
  }

  function dropBrief(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDraggingBrief(false);
    if (!engineReady || submitting) return;
    chooseBrief(event.dataTransfer.files[0]);
  }

  async function reverse(requestId: string) {
    if (!window.confirm("Restore the app to exactly how it was before this update?")) return;
    setReversingId(requestId); setMessage("");
    try {
      const response = await fetch(`/api/app-builder/requests/${requestId}/reverse`, { method: "POST" });
      const result = response.headers.get("content-type")?.includes("application/json")
        ? await response.json().catch(() => ({})) as { error?: string }
        : {};
      if (!response.ok) throw new Error(result.error ?? `Cove could not reverse the update (HTTP ${response.status}).`);
      setMessage("Reversal started. Cove is restoring the previous version.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The reversal could not be started."); }
    finally { setReversingId(""); }
  }

  return <div className={styles.page}>
    <header className={styles.pageHeader}>
      <span className={styles.headerMark}><Mark type="spark"/></span>
      <div className={styles.headerCopy}><p className={styles.kicker}>Cove workspace</p><h1>App Builder</h1><p>Upload a PDF brief. Cove applies the protected change and keeps a reversible record.</p></div>
      <div className={styles.headerStatus} data-ready={engineReady}><i/><span><strong>{engineReady ? "AI connected" : "Connection pending"}</strong><small>{engineReady ? "Ready for controlled requests" : "Uploads remain safely paused"}</small></span></div>
    </header>

    <div className={styles.workspace}>
      <aside className={styles.appRail}>
        <div className={styles.railHeading}><span>Apps you administer</span><strong>{targets.length}</strong></div>
        <nav aria-label="Apps you can update">
          {canSeeOverall && <button type="button" className={styles.allUpdatesButton} data-selected={showingOverall} onClick={() => { setSelectedId(ALL_UPDATES); setMessage(""); }}>
            <i>∞</i><span><strong>All updates</strong><small>{(allRequests ?? []).length} recent requests</small></span><b data-active={hasActive} data-ready="true"/>
          </button>}
          {targets.map((target) => {
            const current = requests.find((request) => request.targetApplicationId === target.applicationId && active.has(request.status));
            const availability = target.readiness === "ready"
              ? target.repositorySource === "cove" ? "Built inside Cove" : "Ready for a brief"
              : "Build source needed";
            return <button type="button" key={target.id} data-selected={target.id === selectedId} onClick={() => { setSelectedId(target.id); setMessage(""); }}>
              <i>{target.name.charAt(0)}</i><span><strong>{target.name}</strong><small>{current?.statusDetail ?? availability}</small></span><b data-active={Boolean(current)} data-ready={target.readiness === "ready"}/>
            </button>;
          })}
        </nav>
        <div className={styles.railRule}><Mark type="check"/><p>Only your active Cove Admin assignments appear here.</p></div>
      </aside>

      <main className={styles.main}>
        {showingOverall ? <OverallStream requests={allRequests ?? []} hasActive={hasActive} onReverse={reverse} reversingId={reversingId}/> : selected ? <>
          <section className={styles.selectedHeader}>
            <div><p className={styles.kicker}>{selected.readiness === "ready" ? selected.repositorySource === "cove" ? "Internal Cove app · shared build source" : selected.repositoryPath : "Build source not connected"}</p><h2>Update {selected.name}</h2><p>{selected.description || "Upload a clear brief and Cove will apply the requested change."}</p></div>
            <a href={selected.productionUrl} target="_blank" rel="noreferrer">Open live app ↗</a>
          </section>

          {selected.readiness === "ready" ? <section className={styles.uploadPanel} aria-labelledby="brief-title">
            {!engineReady && <div className={styles.connectionNotice}><span>Connection pending</span><p>The workspace is ready, but its private OpenAI key and signed webhook still need to be connected. Uploads stay off until both are verified.</p></div>}
            <form ref={form} onSubmit={submit}>
              <input type="hidden" name="targetId" value={selected.id}/>
              <div className={styles.uploadIntro}><span><Mark type="file"/></span><div><p className={styles.kicker}>New request</p><h2 id="brief-title">Upload the brief</h2><p>One PDF, up to 200 MB. Include the outcome, exact wording and screenshots where useful.</p></div></div>
              <label className={styles.drop} data-file={Boolean(selectedFile)} data-dragging={draggingBrief} data-disabled={!engineReady} onDragEnter={dragEnter} onDragOver={(event) => event.preventDefault()} onDragLeave={dragLeave} onDrop={dropBrief} aria-label="Drag and drop a PDF brief, or browse your files">
                <input disabled={!engineReady || submitting} type="file" name="pdf" accept="application/pdf,.pdf" onChange={(event) => chooseBrief(event.target.files?.[0])}/>
                <span><Mark type="file"/></span><div><strong>{draggingBrief ? "Drop your PDF here" : selectedFile?.name || "Drag & drop a PDF brief"}</strong><small>{selectedFile ? "Ready to send securely" : engineReady ? "or click to browse your files" : "Available once the AI connection is verified"}</small></div><b>{draggingBrief ? "Drop" : "Browse"}</b>
              </label>
              <label className={styles.notes}><span>Extra context <small>optional</small></span><textarea disabled={!engineReady} name="notes" maxLength={2000} rows={3} placeholder="For example: keep the current desktop layout, but simplify this on mobile."/></label>
              <div className={styles.actions}><button disabled={!engineReady || !selectedFile || submitting}>{submitting ? uploadProgress < 100 ? `Uploading ${uploadProgress}%…` : "Starting update…" : "Start update"}<Mark type="arrow"/></button>{message && <p role="status">{message}</p>}</div>
            </form>
          </section> : <section className={styles.setupPanel}>
            <span><Mark type="file"/></span>
            <div><p className={styles.kicker}>One setup step</p><h2>Connect this app’s build source</h2><p>Your Admin access is confirmed. Cove only needs to know where this app is built before it can prepare a protected change.</p></div>
            <a href="/systems">Open Systems <Mark type="arrow"/></a>
          </section>}

          <section className={styles.activity}>
            <header><div><p className={styles.kicker}>Request history</p><h2>Updates</h2></div><span>{hasActive ? "Refreshing automatically" : "Durable activity record"}</span></header>
            {selectedRequests.length ? <div className={styles.requestList}>{selectedRequests.map((request) => <RequestCard request={request} key={request.id} onReverse={canSeeOverall ? reverse : undefined} reversing={reversingId === request.id}/>)}</div> : <div className={styles.empty}><span>01</span><div><h3>No requests yet</h3><p>Your first brief for {selected.name} will appear here with a lasting progress trail.</p></div></div>}
          </section>
        </> : <section className={styles.noApps}><span><Mark type="spark"/></span><h2>No apps are assigned to you as Admin.</h2><p>Ask a Cove administrator to review your application access.</p></section>}
      </main>
    </div>
    <footer className={styles.safety}><span><Mark type="check"/></span><p><strong>Controlled by Cove.</strong> The selected app comes from your Admin access, sensitive files remain protected, and every published update can be reversed from its activity record.</p></footer>
  </div>;
}

function RequestCard({ request, showTarget = false, onReverse, reversing = false }: { request: AppBuilderRequest; showTarget?: boolean; onReverse?: (id: string) => void; reversing?: boolean }) {
  const working = active.has(request.status);
  const superseded = request.status === "failed" && request.statusDetail.startsWith("Superseded");
  return <article className={styles.request} data-status={request.status}>
    <span className={styles.statusIcon}>{request.status === "needs_approval" ? "↗" : request.status === "failed" && !superseded ? "!" : working ? "↻" : "✓"}</span>
    <div>{showTarget && <p className={styles.requestTarget}>{request.targetName}</p>}<div className={styles.requestTitle}><h3>{request.filename}</h3><span>{superseded ? "Superseded" : labels[request.status]}</span></div><p>{request.statusDetail}</p>{request.summary && <blockquote>{request.summary}</blockquote>}{request.error && <p className={styles.error}>{request.error}</p>}<small>{request.requestedByName} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(request.createdAt))}</small></div>
    {(request.pullUrl || (onReverse && request.status === "live")) && <div className={styles.requestActions}>
      {request.pullUrl && <a href={request.pullUrl} target="_blank" rel="noreferrer">View change <Mark type="arrow"/></a>}
      {onReverse && request.status === "live" && <button type="button" disabled={reversing} onClick={() => onReverse(request.id)}>{reversing ? "Starting…" : "Reverse"}</button>}
    </div>}
  </article>;
}

function OverallStream({ requests, hasActive, onReverse, reversingId }: { requests: AppBuilderRequest[]; hasActive: boolean; onReverse: (id: string) => void; reversingId: string }) {
  const working = requests.filter((request) => active.has(request.status)).length;
  const live = requests.filter((request) => request.status === "live").length;
  return <>
    <section className={styles.overallHeader}>
      <div><p className={styles.kicker}>App Builder administration</p><h2>All updates</h2><p>One stream for every protected, reversible App Builder update across Cove.</p></div>
      <dl><div><dt>Recent</dt><dd>{requests.length}</dd></div><div><dt>In progress</dt><dd>{working}</dd></div><div><dt>Live</dt><dd>{live}</dd></div></dl>
    </section>
    <section className={`${styles.activity} ${styles.overallActivity}`}>
      <header><div><p className={styles.kicker}>Overall stream</p><h2>Update activity</h2></div><span>{hasActive ? "Refreshing automatically" : "Across every application"}</span></header>
      {requests.length ? <div className={styles.requestList}>{requests.map((request) => <RequestCard request={request} showTarget key={request.id} onReverse={onReverse} reversing={reversingId === request.id}/>)}</div> : <div className={styles.empty}><span>00</span><div><h3>No requests yet</h3><p>The first protected App Builder request will appear here for administrators.</p></div></div>}
    </section>
  </>;
}
