// Brand name chip tinted with the brand's primary colour. The colour is
// mixed toward ink for text and toward the card for the fill, so any brand
// hue stays readable; null colour falls back to the neutral chip look.

import type { CSSProperties } from "react";
import styles from "./brand-tag.module.css";

export function BrandTag({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className={styles.tag}
      style={color ? ({ "--tag": color } as CSSProperties) : undefined}
    >
      {name}
    </span>
  );
}
