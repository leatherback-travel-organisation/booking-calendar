import assert from "node:assert/strict";
import test from "node:test";

import { appUrl } from "./app-url.ts";

// Regression (21 Aug): production had no NEXT_PUBLIC_APP_URL and three of the
// internal pages defaulted to localhost, so every "Copy link" button on the
// dashboard, Team and Routing pages produced a URL that opened nothing for the
// guest. An unset var must never yield a link that only works on a laptop.
test("an unset NEXT_PUBLIC_APP_URL falls back to the production host", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  try {
    assert.equal(appUrl(), "https://cove.leatherbacktravel.com");
  } finally {
    if (previous !== undefined) process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});

test("a configured origin wins, so dev keeps its localhost links", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
  try {
    assert.equal(appUrl(), "http://localhost:3001");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});
