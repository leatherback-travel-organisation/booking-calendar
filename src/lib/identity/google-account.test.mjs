import assert from "node:assert/strict";
import test from "node:test";
import { isVerifiedGoogleAccount } from "./google-account.ts";

const email = "matthew@leatherbacktravel.com";

test("accepts Clerk frontend and backend labels for a verified Google account", () => {
  for (const provider of ["google", "oauth_google"]) {
    assert.equal(isVerifiedGoogleAccount({
      provider,
      emailAddress: email,
      verification: { status: "verified" },
    }, email), true);
  }
});

test("rejects non-Google, unverified, and mismatched external accounts", () => {
  assert.equal(isVerifiedGoogleAccount({
    provider: "oauth_microsoft",
    emailAddress: email,
    verification: { status: "verified" },
  }, email), false);
  assert.equal(isVerifiedGoogleAccount({
    provider: "oauth_google",
    emailAddress: email,
    verification: { status: "unverified" },
  }, email), false);
  assert.equal(isVerifiedGoogleAccount({
    provider: "oauth_google",
    emailAddress: "someone@example.com",
    verification: { status: "verified" },
  }, email), false);
});
