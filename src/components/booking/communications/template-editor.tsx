"use client";

// The template editor: subject + Tiptap body where every {{variable}} is an
// inline chip, "/" opens the registry-backed picker, preview flips between
// chips and sample values, and the full branded email renders in an iframe.
// Saving validates against the registry first — typos surface here, never in
// a guest's inbox.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { applyToMany, previewRender, saveTemplate } from "@/app/booking/communications/actions";
import { BackLink } from "@/components/booking/back-link";
import { renderTemplate, UnknownVariableError, validateTemplate } from "@/lib/booking/notify/render.ts";
import { sampleValues } from "@/lib/booking/notify/variables";
import {
  chipHtmlToTokens,
  computeApplyDiff,
  SOURCE_LABEL,
  tokensToChipHtml,
  type Moment,
  type ScopeSource,
  type TemplateRowMeta,
} from "@/lib/booking/notify/template-scope.ts";
import {
  registerPickerHandlers,
  VariableChip,
  VariableSuggestion,
  type PickerSnapshot,
  type VariableItem,
} from "./variable-chip";
import styles from "./template-editor.module.css";

const EXTENSIONS = [StarterKit, VariableChip, VariableSuggestion];

export type EditorBrand = { key: string; name: string };

type TemplateEditorProps = {
  moment: Moment;
  momentLabel: string;
  momentDescription: string;
  brands: EditorBrand[];
  typeKeys: string[];
  scope: { brandKey: string; typeKey: string };
  initial: { subject: string; bodyHtml: string };
  source: ScopeSource;
  momentRows: TemplateRowMeta[];
  canManage: boolean;
  startInPreview: boolean;
};

type InlineError = { message: string; variables?: string[] };

function typeLabel(key: string): string {
  return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TemplateEditor(props: TemplateEditorProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [subject, setSubject] = useState(props.initial.subject);
  const [mode, setMode] = useState<"variables" | "values">("variables");
  const [error, setError] = useState<InlineError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // --- "/" variable picker --------------------------------------------------
  const [picker, setPicker] = useState<PickerSnapshot | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pickItemRef = useRef<(item: VariableItem) => void>(() => {});

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: tokensToChipHtml(props.initial.bodyHtml),
    editable: props.canManage,
    immediatelyRender: false,
  });

  // Wire the suggestion plugin to React through the extension's per-editor
  // storage. The mutable store lives outside React state entirely.
  useEffect(() => {
    if (!editor) return;
    const store = { snapshot: null as PickerSnapshot | null, index: 0 };
    pickItemRef.current = (item) => store.snapshot?.command(item);
    registerPickerHandlers(editor, {
      onState: (snapshot) => {
        store.snapshot = snapshot;
        store.index = 0;
        setActiveIndex(0);
        setPicker(snapshot);
      },
      onKeyDown: (event) => {
        const current = store.snapshot;
        if (!current || current.items.length === 0) return false;
        if (event.key === "ArrowDown") {
          store.index = (store.index + 1) % current.items.length;
          setActiveIndex(store.index);
          return true;
        }
        if (event.key === "ArrowUp") {
          store.index = (store.index - 1 + current.items.length) % current.items.length;
          setActiveIndex(store.index);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          current.command(current.items[store.index]);
          return true;
        }
        if (event.key === "Escape") {
          store.snapshot = null;
          setPicker(null);
          return true;
        }
        return false;
      },
    });
    return () => {
      registerPickerHandlers(editor, null);
    };
  }, [editor]);

  const serializeBody = () => chipHtmlToTokens(editor?.getHTML() ?? props.initial.bodyHtml);

  // --- scope switching ------------------------------------------------------
  const navigateScope = (brandKey: string, typeKey: string) => {
    const query = new URLSearchParams();
    if (brandKey) query.set("brand", brandKey);
    if (typeKey) query.set("type", typeKey);
    const search = query.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  };

  // --- in-body sample-value preview ----------------------------------------
  let valuesPreview: { subject: string; body: string } | null = null;
  let valuesError: InlineError | null = null;
  if (mode === "values") {
    try {
      const samples = sampleValues();
      valuesPreview = {
        subject: renderTemplate(subject, samples),
        body: renderTemplate(serializeBody(), samples),
      };
    } catch (caught) {
      valuesError =
        caught instanceof UnknownVariableError
          ? { message: "Unknown variables — the preview can't render until these are fixed:", variables: caught.variables }
          : { message: "The preview could not be rendered." };
    }
  }

  // --- full email preview ---------------------------------------------------
  const [previewOpen, setPreviewOpen] = useState(props.startInPreview);
  const [emailPreview, setEmailPreview] = useState<{ html: string; subject: string } | null>(null);
  const [emailError, setEmailError] = useState<InlineError | null>(null);
  const [previewLoading, startPreviewLoad] = useTransition();
  const previewLoadedOnce = useRef(false);

  const refreshEmailPreview = () => {
    const bodyHtml = serializeBody();
    startPreviewLoad(async () => {
      const result = await previewRender({ brandKey: props.scope.brandKey, subject, bodyHtml });
      if (result.ok) {
        setEmailPreview({ html: result.html, subject: result.subject });
        setEmailError(null);
      } else {
        setEmailError({ message: result.error, variables: result.unknownVariables });
      }
    });
  };

  useEffect(() => {
    if (previewOpen && editor && !previewLoadedOnce.current) {
      previewLoadedOnce.current = true;
      refreshEmailPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, editor]);

  // --- save -----------------------------------------------------------------
  const handleSave = () => {
    setNotice(null);
    const bodyHtml = serializeBody();
    try {
      validateTemplate(subject);
      validateTemplate(bodyHtml);
    } catch (caught) {
      if (caught instanceof UnknownVariableError) {
        setError({ message: "Unknown variables — fix these before saving:", variables: caught.variables });
        return;
      }
      throw caught;
    }
    startSaving(async () => {
      const result = await saveTemplate({
        moment: props.moment,
        brandKey: props.scope.brandKey,
        typeKey: props.scope.typeKey,
        subject,
        bodyHtml,
      });
      if (result.ok) {
        setError(null);
        setNotice("Saved.");
        router.refresh();
      } else {
        setError({ message: result.error, variables: result.unknownVariables });
      }
    });
  };

  // --- apply to many --------------------------------------------------------
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [applying, startApplying] = useTransition();

  const applyTargets = selectedBrands.map((brandKey) => ({
    brandKey,
    eventTypeKey: props.scope.typeKey || null,
  }));
  const applyDiff = computeApplyDiff(props.moment, applyTargets, props.momentRows, props.brands);

  const toggleBrand = (brandKey: string) => {
    setConfirmChecked(false);
    setSelectedBrands((current) =>
      current.includes(brandKey) ? current.filter((key) => key !== brandKey) : [...current, brandKey],
    );
  };

  const handleApply = () => {
    setNotice(null);
    const bodyHtml = serializeBody();
    startApplying(async () => {
      const result = await applyToMany({
        moment: props.moment,
        subject,
        bodyHtml,
        sourceBrandKey: props.scope.brandKey,
        targets: selectedBrands.map((brandKey) => ({ brandKey, typeKey: props.scope.typeKey })),
      });
      if (result.ok) {
        setError(null);
        setNotice(`Copied to ${result.applied} brand${result.applied === 1 ? "" : "s"}.`);
        setSelectedBrands([]);
        setConfirmChecked(false);
        setApplyOpen(false);
        router.refresh();
      } else {
        setError({ message: result.error, variables: result.unknownVariables });
      }
    });
  };

  return (
    <div className={styles.editor}>
      <header className={styles.header}>
        <div>
          <BackLink href="/booking/communications" label="Guest Communications" />
          <h2 className={styles.title}>{props.momentLabel}</h2>
          <p className={styles.description}>{props.momentDescription}</p>
        </div>
        <span className={styles.sourceBadge} data-source={props.source}>
          {SOURCE_LABEL[props.source]}
        </span>
      </header>

      <div className={styles.scopeBar}>
        <label className={styles.scopeField}>
          <span>Brand</span>
          <select
            value={props.scope.brandKey}
            onChange={(event) => navigateScope(event.target.value, props.scope.typeKey)}
          >
            <option value="">Default (all brands)</option>
            {props.brands.map((brand) => (
              <option key={brand.key} value={brand.key}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.scopeField}>
          <span>Call type</span>
          <select
            value={props.scope.typeKey}
            onChange={(event) => navigateScope(props.scope.brandKey, event.target.value)}
          >
            <option value="">All types</option>
            {props.typeKeys.map((key) => (
              <option key={key} value={key}>
                {typeLabel(key)}
              </option>
            ))}
          </select>
        </label>
        {!props.canManage ? (
          <span className={styles.readOnlyNote}>Read-only — ask a Pod Lead to toggle on editing for you.</span>
        ) : null}
      </div>

      <section className={styles.panel}>
        <label className={styles.subjectField}>
          <span>Subject</span>
          <input
            type="text"
            value={subject}
            readOnly={!props.canManage}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject line — {{variables}} work here too"
          />
        </label>

        <div className={styles.bodyToolbar}>
          <div className={styles.modeToggle} role="group" aria-label="Body preview mode">
            <button
              type="button"
              data-active={mode === "variables" || undefined}
              onClick={() => setMode("variables")}
            >
              Show variables
            </button>
            <button type="button" data-active={mode === "values" || undefined} onClick={() => setMode("values")}>
              Preview values
            </button>
          </div>
          {props.canManage ? <span className={styles.hint}>Type / in the body to insert a variable</span> : null}
        </div>

        <div className={styles.bodyArea}>
          <div hidden={mode !== "variables"}>
            <EditorContent editor={editor} className={styles.body} />
          </div>
          {mode === "values" ? (
            valuesPreview ? (
              <div className={styles.valuesPreview}>
                <p className={styles.valuesSubject}>{valuesPreview.subject}</p>
                <div dangerouslySetInnerHTML={{ __html: valuesPreview.body }} />
              </div>
            ) : (
              <div className={styles.errorBox}>
                <p>{valuesError?.message}</p>
                {valuesError?.variables ? (
                  <ul>
                    {valuesError.variables.map((name) => (
                      <li key={name}>
                        <code>{`{{${name}}}`}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          ) : null}
        </div>

        {error ? (
          <div className={styles.errorBox}>
            <p>{error.message}</p>
            {error.variables ? (
              <ul>
                {error.variables.map((name) => (
                  <li key={name}>
                    <code>{`{{${name}}}`}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {props.canManage ? (
          <div className={styles.actionsRow}>
            <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </button>
            {notice ? <span className={styles.notice}>{notice}</span> : null}
          </div>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3>Email preview</h3>
          <div className={styles.panelHeaderActions}>
            {previewOpen ? (
              <button type="button" className={styles.quietButton} onClick={refreshEmailPreview} disabled={previewLoading}>
                {previewLoading ? "Rendering…" : "Refresh"}
              </button>
            ) : null}
            <button type="button" className={styles.quietButton} onClick={() => setPreviewOpen((open) => !open)}>
              {previewOpen ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {previewOpen ? (
          emailError ? (
            <div className={styles.errorBox}>
              <p>{emailError.message}</p>
              {emailError.variables ? (
                <ul>
                  {emailError.variables.map((name) => (
                    <li key={name}>
                      <code>{`{{${name}}}`}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : emailPreview ? (
            <div className={styles.emailPreview}>
              <p className={styles.emailSubject}>
                <span>Subject</span> {emailPreview.subject}
              </p>
              <iframe title="Branded email preview" className={styles.emailFrame} srcDoc={emailPreview.html} />
            </div>
          ) : (
            <p className={styles.mutedNote}>{previewLoading ? "Rendering the branded email…" : "No preview yet."}</p>
          )
        ) : (
          <p className={styles.mutedNote}>See the exact branded email a guest receives, with sample details filled in.</p>
        )}
      </section>

      {props.canManage ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Copy to other brands</h3>
            <button type="button" className={styles.quietButton} onClick={() => setApplyOpen((open) => !open)}>
              {applyOpen ? "Hide" : "Show"}
            </button>
          </div>
          {applyOpen ? (
            <div className={styles.applyPanel}>
              <p className={styles.mutedNote}>
                Copies the subject and body above to the selected brands
                {props.scope.typeKey ? ` for ${typeLabel(props.scope.typeKey)} calls` : ""}.
                {props.scope.brandKey
                  ? ` Mentions of ${props.brands.find((b) => b.key === props.scope.brandKey)?.name ?? "this brand"} switch to the {{brand.name}} variable automatically, so each copy greets guests as its own brand.`
                  : ""}{" "}
                Nothing is copied silently — review the list, then confirm.
              </p>
              <div className={styles.applyBrands}>
                {props.brands
                  .filter((brand) => brand.key !== props.scope.brandKey)
                  .map((brand) => (
                    <label key={brand.key} className={styles.applyBrand}>
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(brand.key)}
                        onChange={() => toggleBrand(brand.key)}
                      />
                      <span>{brand.name}</span>
                    </label>
                  ))}
              </div>
              {applyDiff.length > 0 ? (
                <>
                  <ul className={styles.diffList}>
                    {applyDiff.map((row) => (
                      <li key={`${row.brandKey}:${row.eventTypeKey ?? ""}`} data-action={row.action}>
                        {row.summary}
                      </li>
                    ))}
                  </ul>
                  <label className={styles.confirmRow}>
                    <input
                      type="checkbox"
                      checked={confirmChecked}
                      onChange={(event) => setConfirmChecked(event.target.checked)}
                    />
                    <span>
                      Replace the {applyDiff.length} template{applyDiff.length === 1 ? "" : "s"} listed above
                    </span>
                  </label>
                  <button
                    type="button"
                    className={styles.saveButton}
                    onClick={handleApply}
                    disabled={!confirmChecked || applying}
                  >
                    {applying ? "Copying…" : `Copy to ${applyDiff.length} brand${applyDiff.length === 1 ? "" : "s"}`}
                  </button>
                </>
              ) : (
                <p className={styles.mutedNote}>Select at least one brand.</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {picker && props.canManage ? (
        <div className={styles.picker} style={{ left: picker.position.left, top: picker.position.top }}>
          {picker.items.length === 0 ? (
            <p className={styles.pickerEmpty}>No matching variables</p>
          ) : (
            picker.items.map((item, index) => (
              <button
                type="button"
                key={item.name}
                className={styles.pickerItem}
                data-active={index === activeIndex || undefined}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickItemRef.current(item);
                }}
              >
                <span className={styles.pickerChip} data-variable-group={item.group}>
                  {item.label}
                </span>
                <code className={styles.pickerName}>{`{{${item.name}}}`}</code>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
