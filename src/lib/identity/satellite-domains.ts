import "server-only";
import { unstable_rethrow } from "next/navigation";

type CachedOrigins = { readonly expiresAt: number; readonly origins: readonly string[] };

let cached: CachedOrigins | null = null;

/**
 * Clerk requires the primary provider to explicitly allow every satellite
 * origin. The domain registry is Clerk-owned, so this list is derived from the
 * supported Backend API instead of a second local allowlist.
 */
export async function getAllowedSatelliteOrigins(): Promise<readonly string[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.origins;
  if (!process.env.CLERK_SECRET_KEY) return [];

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const domains = await client.domains.list();
    const origins = domains.data
      .filter((domain) => domain.isSatellite)
      .map((domain) => `https://${domain.name.toLowerCase()}`)
      .filter((origin, index, all) => all.indexOf(origin) === index)
      .sort();
    cached = { origins, expiresAt: Date.now() + 5 * 60_000 };
    return origins;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[clerk-satellite-domains] failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}
