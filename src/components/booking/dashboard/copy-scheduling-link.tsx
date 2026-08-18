"use client";

// Dashboard quick action: copies the signed-in BM's own guest booking link.
// Same clipboard pattern as team-tools/copy-button, styled as a dashboard
// action button.

import { useState } from "react";
import styles from "./dashboard.module.css";

export function CopySchedulingLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.secondaryAction}
      title={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard unavailable — per-BM copy buttons on /booking/team
          // show the URL for manual copying.
        }
      }}
    >
      {copied ? "Copied" : "Copy scheduling link"}
    </button>
  );
}
