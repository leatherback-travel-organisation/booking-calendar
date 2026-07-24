import Image from "next/image";
import Link from "next/link";
import { emergencyApplicationDirectory } from "@/lib/access/emergency-directory";

type CoveFallbackProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  reference?: string;
  showDirectory?: boolean;
};

export function CoveFallback({
  eyebrow,
  title,
  description,
  children,
  reference,
  showDirectory = true,
}: CoveFallbackProps) {
  return (
    <main className="cove-fallback-page">
      <header className="cove-fallback-header">
        <Link href="/" className="cove-fallback-brand" aria-label="Cove home">
          <span className="cove-fallback-logo-crop" aria-hidden="true">
            <Image src="/images/cove-logo.png" alt="" width={1448} height={1086} priority />
          </span>
        </Link>
        <span className="cove-fallback-status"><i aria-hidden="true" /> Direct application links available</span>
      </header>

      <section className="cove-fallback-card" aria-labelledby="cove-fallback-title">
        <div className="cove-fallback-copy">
          <span className="cove-fallback-kicker">{eyebrow}</span>
          <h1 id="cove-fallback-title">{title}</h1>
          <p>{description}</p>
          <div className="cove-fallback-actions">{children}</div>
          {reference ? <small className="cove-fallback-reference">Reference {reference}</small> : null}
        </div>

        {showDirectory ? <nav className="cove-fallback-directory" aria-labelledby="emergency-apps-title">
          <div className="cove-fallback-directory-heading">
            <span>Emergency directory</span>
            <h2 id="emergency-apps-title">Open an application directly</h2>
            <p>If Cove is unavailable, these addresses remain here for the team.</p>
          </div>
          <ol>
            {emergencyApplicationDirectory.map((application, index) => (
              <li key={application.slug} style={{ "--app-index": index } as React.CSSProperties}>
                <a href={application.url} target="_blank" rel="noreferrer">
                  <span className="cove-fallback-app-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span className="cove-fallback-app-copy">
                    <strong>{application.name}</strong>
                    <small>{application.url}</small>
                  </span>
                  <span className="cove-fallback-app-arrow" aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ol>
        </nav> : null}
      </section>

      {showDirectory ? <p className="cove-fallback-footnote">Direct links do not bypass access controls. An application may still ask you to sign in.</p> : null}
    </main>
  );
}
