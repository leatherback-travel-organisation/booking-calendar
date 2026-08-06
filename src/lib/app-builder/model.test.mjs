import assert from "node:assert/strict";
import test from "node:test";
import { APP_BUILDER_MAX_PDF_BYTES, assertWritablePath, isAppBuilderBriefPath, safeRepositoryPath, validPdfUpload } from "./model.ts";

const signature = new TextEncoder().encode("%PDF-");

test("accepts a bounded PDF with the correct signature", () => {
  assert.equal(validPdfUpload({ name: "brief.pdf", type: "application/pdf", size: 500, signature }), null);
  assert.equal(validPdfUpload({ name: "large-brief.pdf", type: "application/pdf", size: APP_BUILDER_MAX_PDF_BYTES, signature }), null);
});

test("rejects disguised and oversized uploads", () => {
  assert.match(validPdfUpload({ name: "brief.pdf", type: "application/pdf", size: 500, signature: new TextEncoder().encode("hello") }), /valid PDF/);
  assert.match(validPdfUpload({ name: "brief.pdf", type: "application/pdf", size: APP_BUILDER_MAX_PDF_BYTES + 1, signature }), /200 MB/);
  assert.match(validPdfUpload({ name: "brief.txt", type: "text/plain", size: 500, signature }), /Only PDF/);
});

test("accepts App Builder paths before and after Vercel adds its random suffix", () => {
  assert.equal(isAppBuilderBriefPath("app-builder/0cd84c52-fc05-42f0-b5e5-905b58dee2e6.pdf"), true);
  assert.equal(isAppBuilderBriefPath("app-builder/0cd84c52-fc05-42f0-b5e5-905b58dee2e6-o6CGKW7rJ2XrhKAljp3E24bRuQxUTu.pdf"), true);
  assert.equal(isAppBuilderBriefPath("other/0cd84c52-fc05-42f0-b5e5-905b58dee2e6-o6CGKW7rJ2XrhKAljp3E24bRuQxUTu.pdf"), false);
  assert.equal(isAppBuilderBriefPath("app-builder/not-a-uuid-o6CGKW7rJ2XrhKAljp3E24bRuQxUTu.pdf"), false);
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
