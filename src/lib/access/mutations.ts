export type MutationOutcome = "changed" | "unchanged" | "duplicate";

export type RequiredMutationTarget = {
  readonly exists: boolean;
  readonly description: string;
};

/**
 * Server Actions perform an early role check for a useful response, but the
 * database statement must independently confirm that the actor is still an
 * active administrator. This closes the demotion/suspension race between the
 * route boundary and the write.
 */
export function requireMutationAuthorization(authorized: boolean): void {
  if (!authorized) {
    throw new Error("Your administrator access is no longer active.");
  }
}

/**
 * Converts a database mutation result into an explicit, fail-closed outcome.
 * A claimed idempotency key is never enough to report success: every target
 * named by the caller must have been resolved by the same SQL statement.
 */
export function resolveMutationOutcome(input: {
  readonly claimed: boolean;
  readonly changed: boolean;
  readonly requiredTargets: readonly RequiredMutationTarget[];
}): MutationOutcome {
  if (!input.claimed) return "duplicate";

  const missing = input.requiredTargets.find((target) => !target.exists);
  if (missing) throw new Error(`${missing.description} no longer exists.`);

  return input.changed ? "changed" : "unchanged";
}
