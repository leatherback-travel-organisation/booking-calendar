// Guest booking links always name their brand. A link without one falls back
// to the BM's primary brand, which is how Salt Caravan guests were shown
// Carex pages — Jax runs both (Nicola, 8 Sep).
// Run: node --experimental-strip-types --test src/lib/booking/book-url.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookPath, bookUrl } from "./book-url.ts";

test("a path names the BM and the brand", () => {
  const path = bookPath({ staffSlug: "jacqueline-lancaster", brandKey: "salt-caravan" });
  assert.match(path, /bm=jacqueline-lancaster/);
  assert.match(path, /brand=salt-caravan/);
});

test("the same BM produces a different link per brand", () => {
  const salt = bookPath({ staffSlug: "jacqueline-lancaster", brandKey: "salt-caravan" });
  const carex = bookPath({ staffSlug: "jacqueline-lancaster", brandKey: "carex" });
  assert.notEqual(salt, carex);
  assert.ok(!salt.includes("carex"), "a Salt Caravan link must not mention Carex");
});

test("the event type rides along when given, and is left out when not", () => {
  assert.match(bookPath({ staffSlug: "a", brandKey: "b", eventTypeKey: "enquiry" }), /type=enquiry/);
  assert.ok(!bookPath({ staffSlug: "a", brandKey: "b" }).includes("type="));
  assert.ok(!bookPath({ staffSlug: "a", brandKey: "b", eventTypeKey: null }).includes("type="));
});

test("values are escaped rather than pasted in", () => {
  const path = bookPath({ staffSlug: "a b&c=d", brandKey: "x y" });
  assert.ok(!path.includes("a b&c=d"));
  assert.match(path, /brand=x\+y|brand=x%20y/);
});

test("the absolute form does not double up on slashes", () => {
  assert.equal(
    bookUrl("https://cove.leatherbacktravel.com/", { staffSlug: "a", brandKey: "b" }),
    "https://cove.leatherbacktravel.com/book?bm=a&brand=b",
  );
});

// The point of the helper is that nowhere hand-rolls the link any more.
test("no guest-facing link is built by hand", () => {
  const files = [
    "src/lib/booking/notify/messages.ts",
    "src/components/booking-public/ManagePanel.tsx",
    "src/app/invite/[token]/page.tsx",
    "src/app/booking/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
    assert.ok(
      !/["'`]\/book\?bm=|\/book\?bm=\$\{/.test(source),
      `${file} builds a /book?bm= link by hand instead of using bookPath/bookUrl`,
    );
  }
});
