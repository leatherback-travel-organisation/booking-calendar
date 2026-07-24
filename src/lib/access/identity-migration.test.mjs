import assert from "node:assert/strict";
import test from "node:test";

import {
  retiredClerkIssuers,
  shouldRebindRetiredClerkIssuer,
} from "./identity-migration.ts";

test("retired Clerk issuer configuration accepts comma and whitespace separated values", () => {
  assert.deepEqual(
    retiredClerkIssuers("https://old.example.test, https://older.example.test\nhttps://old.example.test"),
    ["https://old.example.test", "https://older.example.test"],
  );
});

test("retired Clerk rebind is attempted only for a new issuer", () => {
  const retiredIssuers = ["https://old.example.test"];

  assert.equal(
    shouldRebindRetiredClerkIssuer({
      currentIssuer: "https://new.example.test",
      retiredIssuers,
    }),
    true,
  );
  assert.equal(
    shouldRebindRetiredClerkIssuer({
      currentIssuer: "https://old.example.test",
      retiredIssuers,
    }),
    false,
  );
  assert.equal(
    shouldRebindRetiredClerkIssuer({
      currentIssuer: "https://new.example.test",
      retiredIssuers: [],
    }),
    false,
  );
});
