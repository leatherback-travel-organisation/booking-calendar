"use client";

// Brand-themed page chrome shared by /book and /manage/[token]. Sets the
// --bp-primary / --bp-accent custom properties inline from the brand colours
// with the support phone in the footer (the header is the logo alone).

import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import styles from "./bp.module.css";
import { DEFAULT_ACCENT, DEFAULT_PRIMARY } from "./types";

export type FrameBrand = {
  name: string;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorAccent: string | null;
  phone: string | null;
};

export function BrandFrame({
  brand,
  embed = false,
  children,
}: {
  brand: FrameBrand | null;
  embed?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!embed) return;
    document.documentElement.classList.add("bp-embed");
    return () => document.documentElement.classList.remove("bp-embed");
  }, [embed]);

  const style = {
    "--bp-primary": brand?.colorPrimary ?? DEFAULT_PRIMARY,
    "--bp-accent": brand?.colorAccent ?? DEFAULT_ACCENT,
  } as CSSProperties;

  const phone = brand?.phone ?? null;

  return (
    <div className={embed ? `${styles.frame} ${styles.frameEmbed}` : styles.frame} style={style}>
      <div className={styles.inner}>
        {!embed && brand && (
          <header className={styles.header}>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className={styles.logoImg} />
            ) : (
              <span className={styles.brandName}>{brand.name}</span>
            )}
          </header>
        )}
        {children}
        <footer className={styles.footer}>
          {phone ? (
            <>
              Questions? Call {brand?.name ?? "us"} on{" "}
              <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
              {" "}and we&rsquo;ll happily help.
            </>
          ) : (
            <>We&rsquo;re happy to help with anything at all.</>
          )}
        </footer>
      </div>
    </div>
  );
}
