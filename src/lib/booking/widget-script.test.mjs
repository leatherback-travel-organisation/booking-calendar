// Sanity tests for the embed widget source served by /embed.js.
// Run: node --experimental-strip-types --test src/lib/booking/widget-script.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { WIDGET_SOURCE } from "./widget-script.ts";

test("stays well under the 15KB embed budget", () => {
  const bytes = Buffer.byteLength(WIDGET_SOURCE, "utf8");
  assert.ok(bytes < 15000, `widget source is ${bytes} bytes (budget 15000)`);
});

test("renders into a shadow root", () => {
  assert.ok(WIDGET_SOURCE.includes("attachShadow"));
});

test("never logs at error level", () => {
  assert.ok(!WIDGET_SOURCE.includes("console.error"));
  assert.ok(!WIDGET_SOURCE.includes("console.warn"));
});

test("listens for the overlay close message", () => {
  assert.ok(WIDGET_SOURCE.includes("leatherback-booking-close"));
});

test("scopes the UI: trip pages dock, home floats, other pages get nothing", () => {
  // The 1 Sep rule: the floating card exists only on the home page; trip
  // pages get only the docked row; every other page renders nothing.
  assert.ok(WIDGET_SOURCE.includes("if (!isTrip && !isHome) return;"));
  assert.ok(WIDGET_SOURCE.includes("if (isTrip) {"));
  assert.ok(!WIDGET_SOURCE.includes("IntersectionObserver"), "dock-visibility gating is retired");
});

test("is syntactically valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(WIDGET_SOURCE));
});
