"use client";

import Link from "next/link";
import { CoveFallback } from "@/components/cove/cove-fallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <CoveFallback
      eyebrow="Page recovery"
      title="The tide went out unexpectedly."
      description="Nothing has been changed. Try the page again, or return to Cove."
      reference={error.digest}
    >
      <button className="cove-fallback-primary" type="button" onClick={reset}>
        <span>Try again</span><b aria-hidden="true">↻</b>
      </button>
      <Link className="cove-fallback-secondary" href="/">Return to Cove</Link>
    </CoveFallback>
  );
}
