export function workspaceDomainForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) {
    throw new Error("A valid work email address is required.");
  }
  return normalized.slice(separator + 1);
}
