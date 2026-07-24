"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  updatePersonalDetailsAction,
  type PersonalDetailsActionResult,
} from "@/lib/airtable/actions";
import type { PersonalDetailSectionKind } from "@/lib/airtable/personal-details";
import styles from "./personal-details.module.css";

type EditableSection = {
  readonly kind: PersonalDetailSectionKind;
  readonly title: string;
  readonly entries: readonly { readonly label: string; readonly value?: string }[];
};

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 16.8-.8 4 4-.8L18.7 8.5l-3.2-3.2L4 16.8Z" />
      <path d="m13.8 7 3.2 3.2M14.8 6l1.5-1.5a2.2 2.2 0 0 1 3.2 3.1L18 9.2" />
    </svg>
  );
}

function inputType(label: string) {
  if (label === "Date of Birth") return "date";
  if (label === "Email") return "email";
  if (/phone|mobile/i.test(label)) return "tel";
  return "text";
}

function inputValue(label: string, value?: string) {
  if (label === "Date of Birth") return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  return value ?? "";
}

export function PersonalDetailsEditor({ sections }: { sections: readonly EditableSection[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<PersonalDetailsActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isPending, open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = Object.fromEntries(
      sections.flatMap((section) => section.entries).map((entry) => [
        entry.label,
        String(data.get(entry.label) ?? ""),
      ]),
    );
    startTransition(async () => {
      const result = await updatePersonalDetailsAction({ fields });
      setNotice(result);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  const dialog = open ? (
    <div className={styles.editorBackdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isPending) setOpen(false);
    }}>
      <section className={styles.editorDialog} role="dialog" aria-modal="true" aria-labelledby="edit-details-title">
        <header className={styles.editorHeader}>
          <div>
            <span>Team Members</span>
            <h2 id="edit-details-title">Edit my details</h2>
            <p>Changes save directly to your matched HR record.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} disabled={isPending} aria-label="Close edit details">×</button>
        </header>

        <form onSubmit={submit}>
          <div className={styles.editorBody}>
            {sections.map((section) => (
              <fieldset key={section.kind}>
                <legend>{section.title}</legend>
                <div className={styles.editorGrid}>
                  {section.entries.map((entry) => {
                    const multiline = entry.label === "Address" || /international banking/i.test(entry.label);
                    return (
                      <label className={multiline ? styles.editorWideField : undefined} key={entry.label}>
                        <span>{entry.label}</span>
                        {multiline ? (
                          <textarea name={entry.label} defaultValue={entry.value ?? ""} maxLength={2_000} rows={3} />
                        ) : (
                          <input
                            name={entry.label}
                            type={inputType(entry.label)}
                            defaultValue={inputValue(entry.label, entry.value)}
                            maxLength={2_000}
                            inputMode={/BSB|account number|tax file|ABN/i.test(entry.label) ? "numeric" : undefined}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <p className={styles.editorGuardrail}>Your name, work email, employment details and uploaded documents stay People &amp; Operations controlled.</p>
            {notice && !notice.ok ? <p className={styles.editorError} role="alert">{notice.message}</p> : null}
          </div>
          <footer className={styles.editorFooter}>
            <button type="button" className={styles.editorCancel} onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
            <button type="submit" className={styles.editorSave} disabled={isPending}>{isPending ? "Saving…" : "Save changes"}</button>
          </footer>
        </form>
      </section>
    </div>
  ) : null;

  return (
    <>
      <div className={styles.editControl}>
        {notice?.ok ? <span role="status">{notice.message}</span> : null}
        <button type="button" onClick={() => { setNotice(null); setOpen(true); }}>
          <EditIcon />
          Edit details
        </button>
      </div>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
