// A back link that looks like a real button — obviously clickable, used at
// the top of every booking sub-page that steps back to a parent page.

import Link from "next/link";
import styles from "./back-link.module.css";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={styles.backLink}>
      <span aria-hidden="true">←</span> Back to {label}
    </Link>
  );
}
