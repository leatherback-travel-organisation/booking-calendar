import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { identityMode } from "@/lib/identity/server";
import { getAllowedSatelliteOrigins } from "@/lib/identity/satellite-domains";
import { resolveSignInRedirect } from "@/lib/identity/sign-in-redirect";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const mode = identityMode();

  if (mode === "clerk") {
    const [params, allowedSatelliteOrigins] = await Promise.all([
      searchParams,
      getAllowedSatelliteOrigins(),
    ]);
    const returnUrl = resolveSignInRedirect(params.redirect_url, allowedSatelliteOrigins);

    return (
      <main className="identity-page">
        <div className="identity-brand" aria-label="Cove">
          <span className="identity-brand-mark" aria-hidden="true"><i /><b /></span>
          <span>Cove</span>
        </div>
        <section className="identity-login-card" aria-labelledby="identity-login-title">
          <div className="identity-login-intro">
            <p className="identity-login-kicker">Leatherback workspace</p>
            <h1 id="identity-login-title">Welcome to Cove</h1>
            <p>Everything you need for work, together in one secure place.</p>
          </div>
          <div className="identity-login-action">
            <p>Sign in with Google using your approved work email.</p>
            <SignIn
              routing="hash"
              forceRedirectUrl={returnUrl}
              signUpForceRedirectUrl={returnUrl}
              appearance={{
                elements: {
                  rootBox: { width: "100%" },
                  cardBox: { width: "100%", boxShadow: "none" },
                  card: { width: "100%", padding: 0, background: "transparent", boxShadow: "none" },
                  header: { display: "none" },
                  dividerRow: { display: "none" },
                  formFieldRow: { display: "none" },
                  formButtonPrimary: { display: "none" },
                  footer: { display: "none" },
                },
              }}
            />
            <small>Access is available to people approved in Cove Admin.</small>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="identity-page">
      <section className="identity-card">
        <p className="eyebrow">Cove identity</p>
        <h1>{mode === "preview" ? "Preview access is active." : "Sign-in setup is required."}</h1>
        <p className="lede">
          {mode === "preview"
            ? "This demo uses fictional people and synthetic access data. It is separate from live Leatherback identity and systems."
            : "Connect Clerk to the Vercel project and enable verified Google Workspace sign-in before production access is allowed."}
        </p>
        {mode === "preview" ? <Link className="primary-button" href="/">Enter Cove demo</Link> : null}
      </section>
    </main>
  );
}
