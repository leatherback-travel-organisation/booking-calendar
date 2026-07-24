import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";
import type { NextMiddleware, NextRequest } from "next/server";

export type CoveProxyOptions = Omit<ClerkMiddlewareOptions, "domain" | "isSatellite" | "satelliteAutoSync"> & {
  primaryUrl?: string;
  signInUrl?: string;
  signUpUrl?: string;
  publicRoutes?: string[];
  protectedRoutes?: string[];
};

export const DEFAULT_PUBLIC_ROUTES: readonly string[];
export const COVE_PROXY_MATCHER: readonly string[];
export function createCoveProtectedRoute(patterns: string[]): (request: NextRequest) => boolean;
export function getCoveMiddlewareOptions(overrides?: CoveProxyOptions): ClerkMiddlewareOptions;
/** @deprecated Use getCoveMiddlewareOptions. This alias now returns shared-session configuration. */
export const getCoveSatelliteMiddlewareOptions: typeof getCoveMiddlewareOptions;
export function createCoveProxy(options?: CoveProxyOptions): NextMiddleware;
