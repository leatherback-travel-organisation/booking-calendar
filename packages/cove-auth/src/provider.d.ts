import type { NextClerkProviderProps } from "@clerk/nextjs";
import type { ReactNode } from "react";

export type CoveProviderOptions = Omit<NextClerkProviderProps, "children" | "domain" | "isSatellite" | "satelliteAutoSync"> & {
  primaryUrl?: string;
  signInUrl?: string;
  signUpUrl?: string;
  publishableKey?: string;
};

/** @deprecated Use CoveProviderOptions. */
export type CoveSatelliteProviderOptions = CoveProviderOptions;

export function getCoveProviderProps(overrides?: CoveProviderOptions): NextClerkProviderProps;
/** @deprecated Use getCoveProviderProps. This alias now returns shared-session configuration. */
export const getCoveSatelliteProviderProps: typeof getCoveProviderProps;
export function CoveClerkProvider(props: CoveProviderOptions & { children: ReactNode }): ReactNode;
