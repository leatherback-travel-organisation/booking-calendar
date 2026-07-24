import assert from "node:assert/strict";
import test from "node:test";

import { isPreviewIdentityEnabled } from "./mode.ts";

test("Vercel production can never enable demonstration identity", () => {
  assert.equal(
    isPreviewIdentityEnabled({
      VERCEL_ENV: "production",
      NODE_ENV: "production",
      COVE_PREVIEW_MODE: "true",
      COVE_PUBLIC_DEMO_MODE: "true",
    }),
    false,
  );
});

test("Vercel previews always use demonstration identity", () => {
  assert.equal(
    isPreviewIdentityEnabled({
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      COVE_PREVIEW_MODE: "false",
    }),
    true,
  );
});

test("local development requires an explicit preview opt-in", () => {
  assert.equal(
    isPreviewIdentityEnabled({ NODE_ENV: "development", COVE_PREVIEW_MODE: "true" }),
    true,
  );
  assert.equal(
    isPreviewIdentityEnabled({ NODE_ENV: "development", COVE_PREVIEW_MODE: "false" }),
    false,
  );
});

test("non-Vercel production fails closed to live identity", () => {
  assert.equal(
    isPreviewIdentityEnabled({ NODE_ENV: "production", COVE_PREVIEW_MODE: "true" }),
    false,
  );
});
