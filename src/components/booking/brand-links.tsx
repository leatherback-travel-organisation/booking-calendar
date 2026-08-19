// Per-brand booking links for the Routing page. Each link goes on that
// brand's website contact page: the guest searches for their trip and is
// routed to the trip's coordinator (routing stays derived from Airtable).

import type { Brand } from "@/lib/booking/model";
import { CopyButton } from "./team-tools/copy-button";
import styles from "./brand-links.module.css";

export function BrandLinks({ brands, appUrl }: { brands: Brand[]; appUrl: string }) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Brand booking links</h2>
        <p className={styles.hint}>
          Share on each brand&rsquo;s contact page — the guest picks their trip and books with its
          Booking Manager.
        </p>
      </header>
      <ul className={styles.list}>
        {brands.map((brand) => {
          const url = `${appUrl}/book?brand=${encodeURIComponent(brand.key)}`;
          return (
            <li key={brand.id} className={styles.row}>
              <span className={styles.brand}>{brand.name}</span>
              <CopyButton value={url} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
