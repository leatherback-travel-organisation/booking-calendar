import assert from "node:assert/strict";
import test from "node:test";
import { APP_BUILDER_MAX_PDF_BYTES, assertWritablePath, safeRepositoryPath, validPdfUpload } from "./model.ts";

const signature = new TextEncoder().encode("%PDF-");

test("accepts a bounded PDF with the correct signature", () => {
  assert.equal(validPdfUpload({ name: "brief.pdf", type: "application/pdf", size: 500, signature }), null);
});

test("rejects disguised and oversized uploads", () => {
  assert.match(validPdfUpload({ name: "brief.pdf", type: "application/pdf", size: 500, signature: new TextEncoder().encode("hello") }), /valid PDF/);
  assert.match(validPdfUpload({ name: "brief.pdf", type: "application/pdf", size: APP_BUILDER_MAX_PDF_BYTES + 1, signature }), /4 MB/);
  assert.match(validPdfUpload({ name: "brief.txt", type: "text/plain", size: 500, signature }), /Only PDF/);
});

test("repository paths cannot escape the bound repository", () => {
  assert.equal(safeRepositoryPath("src/app/page.tsx"), "src/app/page.tsx");
  assert.throws(() => safeRepositoryPath("../../secrets"), /invalid/);
  assert.throws(() => safeRepositoryPath(""), /invalid/);
});

test("sensitive repository surfaces are blocked below the prompt layer", () => {
  assert.doesNotThrow(() => assertWritablePath("src/components/trip-card.tsx"));
  assert.throws(() => assertWritablePath("src/proxy.ts"), /protected/);
  assert.throws(() => assertWritablePath("src/lib/identity/server.ts"), /protected/);
  assert.throws(() => assertWritablePath(".github/workflows/deploy.yml"), /protected/);
  assert.throws(() => assertWritablePath("package-lock.json"), /protected/);
});
