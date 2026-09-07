// Guest identity fields are never pre-filled — the rule set after a
// confirmation reached the wrong guest on 5 Sep 2026. Every form where a
// guest says who they are must opt out of autofill and must not seed a
// stored name, email or phone into the field.
// Run: node --experimental-strip-types --test src/lib/booking/no-autofill.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GUEST_FORMS = [
  "src/components/booking-public/ConfirmForm.tsx",
  "src/app/invite/[token]/page.tsx",
  "src/app/session/[id]/page.tsx",
];

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

for (const path of GUEST_FORMS) {
  test(`${path} never asks the browser to fill guest details`, () => {
    const source = read(path);
    for (const token of ['autoComplete="name"', 'autoComplete="email"', 'autoComplete="tel"']) {
      assert.ok(!source.includes(token), `${path} still opts in to autofill via ${token}`);
    }
    assert.ok(source.includes("NO_AUTOFILL"), `${path} must spread NO_AUTOFILL onto its guest fields`);
  });

  test(`${path} never seeds a stored value into a guest field`, () => {
    const source = read(path);
    const seeded = /defaultValue=\{[^}]*(guestName|guestEmail|guestPhone|guest_name|guest_email)/i.test(source);
    assert.ok(!seeded, `${path} pre-fills a guest identity field`);
  });
}

test("the booking form drops a value the guest never touched", () => {
  const source = read("src/components/booking-public/ConfirmForm.tsx");
  assert.ok(source.includes("touched.current"), "the focus guard is gone");
  // Every guest identity field must be wired to BOTH halves of the guard.
  const focusHooks = source.match(/onFocus=\{markTouched\}/g) ?? [];
  const guardedInputs = source.match(/onChange=\{guestInput\(/g) ?? [];
  assert.equal(focusHooks.length, 3, "name, email and phone must each mark themselves touched");
  assert.equal(guardedInputs.length, 3, "name, email and phone must each go through guestInput");
});

test("the shared opt-out covers the password managers guests actually use", async () => {
  const { NO_AUTOFILL } = await import("./no-autofill.ts");
  assert.equal(NO_AUTOFILL.autoComplete, "off");
  for (const attr of ["data-1p-ignore", "data-lpignore", "data-bwignore", "data-form-type"]) {
    assert.ok(attr in NO_AUTOFILL, `missing opt-out ${attr}`);
  }
});
