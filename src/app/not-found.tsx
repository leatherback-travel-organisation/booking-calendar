import Link from "next/link";
import { CoveFallback } from "@/components/cove/cove-fallback";

export default function NotFound() {
  return (
    <CoveFallback
      eyebrow="404 · Not found"
      title="This route isn’t on the map."
      description="The page may have moved, or the link may be out of date. Return to Cove to find the right destination."
    >
      <Link className="cove-fallback-primary" href="/">
        <span>Cove home</span><b aria-hidden="true">→</b>
      </Link>
    </CoveFallback>
  );
}
