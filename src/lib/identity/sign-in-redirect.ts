const COVE_PRIMARY_ORIGINS = new Set([
  "https://cove.leatherbacktravel.com",
]);

export function resolveSignInRedirect(
  value: string | string[] | undefined,
  allowedSatelliteOrigins: readonly string[],
) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return "/";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;

  try {
    const target = new URL(candidate);
    if (target.protocol !== "https:" || target.username || target.password) return "/";
    const allowedOrigins = new Set([...COVE_PRIMARY_ORIGINS, ...allowedSatelliteOrigins]);
    return allowedOrigins.has(target.origin) ? target.toString() : "/";
  } catch {
    return "/";
  }
}
