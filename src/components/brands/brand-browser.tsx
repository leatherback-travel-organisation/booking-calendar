"use client";

import Image from "next/image";
import { useState } from "react";
import type { Brand } from "@/lib/airtable/model";

type BrandBrowserProps = {
  brands: Brand[];
};

function brandSwatches(value: string | undefined, fallback: string) {
  const matches = value?.match(/#?[0-9a-f]{6}/gi) ?? [];
  const colours = matches.map((colour) => colour.startsWith("#") ? colour : `#${colour}`);
  return Array.from(new Set(colours.length ? colours : [fallback])).slice(0, 4);
}

export function BrandBrowser({ brands }: BrandBrowserProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(brands.map((brand) => brand.registrationStatus ?? "Status not set")))];
  const needle = query.trim().toLowerCase();
  const visible = brands.filter((brand) => {
    const matchesCategory = category === "All" || brand.registrationStatus === category;
    const matchesQuery = !needle || `${brand.name} ${brand.description} ${brand.registrationStatus} ${brand.legalEntityOwner} ${brand.brandColours}`.toLowerCase().includes(needle);
    return matchesCategory && matchesQuery;
  });

  return (
    <>
      <div className="brand-controls">
        <label className="brand-search">
          <span className="sr-only">Search brands</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the collection" />
          <span aria-hidden="true">⌕</span>
        </label>
        <div className="brand-filters" aria-label="Filter brands by category">
          {categories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
      </div>

      <div className="brand-grid">
        {visible.map((brand, index) => (
          <article className="brand-card" style={{ "--brand-accent": brand.accent, "--brand-order": index } as React.CSSProperties} key={brand.id}>
            <div className={`brand-logo-panel brand-logo-${brand.logoTone ?? "light"}`}>
              {brand.logoUrl ? (
                <Image src={brand.logoUrl} alt={`${brand.name} logo`} width={280} height={80} />
              ) : (
                <div className="brand-logo-missing"><span>{brand.name.slice(0, 1)}</span><small>Logo not linked</small></div>
              )}
            </div>
            <header className="brand-card-header">
              <div>
                <span className="brand-card-category">{brand.category}</span>
                <h2>{brand.name}</h2>
              </div>
              <span className={`brand-card-status status-${brand.status}`}>{brand.registrationStatus ?? "Status not set"}</span>
            </header>
            <p>{brand.description}</p>
            <dl className="brand-card-details">
              <div><dt>Legal entity</dt><dd>{brand.legalEntityOwner ?? "Not added"}</dd></div>
              <div className="brand-colour-row"><dt>Brand colours</dt><dd>{brandSwatches(brand.brandColours, brand.accent).map((colour) => <span key={colour} title={colour} style={{ backgroundColor: colour }} />)}<small>{brand.brandColours ?? "Not added"}</small></dd></div>
            </dl>
            <footer>
              <div className="brand-card-links">
                {brand.website && <a href={brand.website} target="_blank" rel="noreferrer">Website <span aria-hidden="true">↗</span></a>}
                {brand.instagram && <a href={brand.instagram} target="_blank" rel="noreferrer">Instagram <span aria-hidden="true">↗</span></a>}
                {brand.facebook && <a href={brand.facebook} target="_blank" rel="noreferrer">Facebook <span aria-hidden="true">↗</span></a>}
                {brand.brandFilesUrl && <a href={brand.brandFilesUrl} target="_blank" rel="noreferrer">{brand.brandFilesLabel ?? "Brand files"} <span aria-hidden="true">↗</span></a>}
                {brand.brandGuidelinesUrl && <a href={brand.brandGuidelinesUrl} target="_blank" rel="noreferrer">Logo guidelines <span aria-hidden="true">↗</span></a>}
                {brand.productBriefUrl && <a href={brand.productBriefUrl} target="_blank" rel="noreferrer">Product brief <span aria-hidden="true">↗</span></a>}
                {!brand.website && !brand.instagram && !brand.facebook && !brand.brandFilesUrl && !brand.brandGuidelinesUrl && !brand.productBriefUrl && <span className="brand-no-link">No links connected yet</span>}
              </div>
            </footer>
          </article>
        ))}
        {visible.length === 0 && <div className="brand-empty"><strong>No brands found.</strong><span>Try another search or category.</span></div>}
      </div>
    </>
  );
}
