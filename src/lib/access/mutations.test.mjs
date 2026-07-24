import assert from "node:assert/strict";
import test from "node:test";

import {
  requireMutationAuthorization,
  resolveMutationOutcome,
} from "./mutations.ts";

test("database mutations reject an actor whose administrator access changed", () => {
  assert.throws(
    () => requireMutationAuthorization(false),
    /administrator access is no longer active/,
  );
  assert.doesNotThrow(() => requireMutationAuthorization(true));
});

test("a previously claimed request is reported as a duplicate", () => {
  assert.equal(
    resolveMutationOutcome({
      claimed: false,
      changed: false,
      requiredTargets: [{ exists: false, description: "The person" }],
    }),
    "duplicate",
  );
});

test("a claimed request fails closed when a target is missing", () => {
  assert.throws(
    () =>
      resolveMutationOutcome({
        claimed: true,
        changed: false,
        requiredTargets: [
          { exists: true, description: "The person" },
          { exists: false, description: "The application" },
        ],
      }),
    /The application no longer exists/,
  );
});

test("claimed requests distinguish changes from no-ops", () => {
  const requiredTargets = [{ exists: true, description: "The person" }];
  assert.equal(
    resolveMutationOutcome({ claimed: true, changed: true, requiredTargets }),
    "changed",
  );
  assert.equal(
    resolveMutationOutcome({ claimed: true, changed: false, requiredTargets }),
    "unchanged",
  );
});
