export function retiredClerkIssuers(input = process.env.COVE_RETIRED_CLERK_ISSUERS): readonly string[] {
  const issuers = (input ?? "")
    .split(/[\s,]+/)
    .map((issuer) => issuer.trim())
    .filter(Boolean);

  return [...new Set(issuers)];
}

export function shouldRebindRetiredClerkIssuer(input: {
  readonly currentIssuer: string;
  readonly retiredIssuers: readonly string[];
}) {
  return (
    input.retiredIssuers.length > 0 &&
    !input.retiredIssuers.includes(input.currentIssuer)
  );
}
