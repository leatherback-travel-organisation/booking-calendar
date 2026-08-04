import assert from "node:assert/strict";
import test from "node:test";
import {
  COVE_CANONICAL_ORIGIN,
  canonicalProductionUrl,
  coveApplicationLaunchUrl,
} from "./canonical-origin.ts";

test("routes every application card through Cove's protected launch endpoint", () => {
  assert.equal(
    coveApplicationLaunchUrl("trtl"),
    `${COVE_CANONICAL_ORIGIN}/api/cove/launch?applicationSlug=trtl`,
  );
  assert.equal(
    coveApplicationLaunchUrl("supplier-reporting"),
    `${COVE_CANONICAL_ORIGIN}/api/cove/launch?applicationSlug=supplier-reporting`,
  );
  assert.throws(() => coveApplicationLaunchUrl("https://example.com"));
});

test("redirects every non-canonical production hostname before authentication", () => {
  assert.equal(
    canonicalProductionUrl(
      "https://lbcove.vercel.app/systems?view=apps",
      "production",
    )?.toString(),
    `${COVE_CANONICAL_ORIGIN}/systems?view=apps`,
  );
  assert.equal(
    canonicalProductionUrl(
      "https://generated-deployment.vercel.app/api/session",
      "production",
    )?.toString(),
    `${COVE_CANONICAL_ORIGIN}/api/session`,
  );
});

test("leaves the canonical production hostname and previews untouched", () => {
  assert.equal(
    canonicalProductionUrl(`${COVE_CANONICAL_ORIGIN}/`, "production"),
    null,
  );
  assert.equal(
    canonicalProductionUrl("https://preview.vercel.app/", "preview"),
    null,
  );
});
