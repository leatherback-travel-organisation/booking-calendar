import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { CoveFallback } from "./cove-fallback";

export function CoveAccessDenied() {
  return (
    <CoveFallback
      eyebrow="Cove access"
      title="Your account is signed in, but Cove access hasn’t been approved."
      description="Ask a Cove administrator to approve the work email you use for Google sign-in. Once they have, try again and Cove will finish connecting your account."
      showDirectory={false}
    >
      <Link className="cove-fallback-primary" href="/">
        <span>Try again</span><b aria-hidden="true">↻</b>
      </Link>
      <SignOutButton redirectUrl="/sign-in">
        <button className="cove-fallback-secondary" type="button">Sign out and use another account</button>
      </SignOutButton>
    </CoveFallback>
  );
}
