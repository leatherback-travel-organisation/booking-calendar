import assert from "node:assert/strict";
import test from "node:test";

import { applicationFaviconOverride } from "./favicon-overrides.ts";

test("Nest applications use the branded Nest icon override", () => {
  const favicon = applicationFaviconOverride({
      slug: "nest",
      name: "Nest",
      launchUrl: "https://nest.leatherbacktravel.com",
    });

  assert.equal(favicon?.contentType, "image/svg+xml");
  assert.match(new TextDecoder().decode(favicon?.bytes), /#1f6f62/);
});

test("non-Nest applications do not receive the Nest fallback", () => {
  assert.equal(
    applicationFaviconOverride({
      slug: "honest-feedback",
      name: "Honest Feedback",
      launchUrl: "https://feedback.leatherbacktravel.com",
    }),
    null,
  );
});
