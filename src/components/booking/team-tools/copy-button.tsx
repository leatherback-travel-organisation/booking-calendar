"use client";

import { useState } from "react";
import styles from "./team-tools.module.css";

export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard unavailable — the URL is visible for manual copying.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
