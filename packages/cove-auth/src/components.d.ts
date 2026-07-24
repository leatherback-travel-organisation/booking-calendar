import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { CoveAuthErrorKind } from "./errors.js";

export function CoveAccessState(props: {
  kind: CoveAuthErrorKind;
  message?: string;
  coveUrl?: string;
  retryUrl?: string;
}): ReactNode;
export function CoveSuiteSignOutButton(props: ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  redirectUrl?: string;
}): ReactNode;
