import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFaviconUrls,
  isPrivateNetworkAddress,
  obviousUnsafeFaviconHost,
  sniffFaviconContentType,
} from "./favicon-model.ts";

test("favicon discovery resolves declared icons regardless of attribute order", () => {
  const urls = extractFaviconUrls(`
    <link href="/brand/icon-32.png?v=2&amp;dark=0" sizes="32x32" rel="icon">
    <link rel='apple-touch-icon' href='../touch.png'>
    <link rel="stylesheet" href="/not-an-icon.css">
  `, "https://app.example.com/workspace/page");

  assert.deepEqual(urls, [
    "https://app.example.com/brand/icon-32.png?v=2&dark=0",
    "https://app.example.com/touch.png",
  ]);
});

test("favicon discovery rejects executable and credential-bearing icon URLs", () => {
  const urls = extractFaviconUrls(`
    <link rel="icon" href="javascript:alert(1)">
    <link rel="icon" href="https://user:secret@example.com/icon.png">
    <link rel="icon" href="https://cdn.example.com/icon.png#fragment">
  `, "https://app.example.com");
  assert.deepEqual(urls, ["https://cdn.example.com/icon.png"]);
});

test("private, local, mapped and reserved addresses are blocked", () => {
  for (const value of ["127.0.0.1", "10.1.2.3", "172.20.1.1", "192.168.1.1", "169.254.1.2", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateNetworkAddress(value), true, value);
  }
  assert.equal(obviousUnsafeFaviconHost("service.internal"), true);
  assert.equal(obviousUnsafeFaviconHost("localhost"), true);
  assert.equal(obviousUnsafeFaviconHost("app.vercel.app"), false);
  assert.equal(isPrivateNetworkAddress("76.76.21.21"), false);
});

test("favicon bytes must match a supported image signature", () => {
  assert.equal(sniffFaviconContentType(Uint8Array.from([0, 0, 1, 0, 1, 0])), "image/x-icon");
  assert.equal(sniffFaviconContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])), "image/png");
  assert.equal(sniffFaviconContentType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), "image/svg+xml");
  assert.equal(sniffFaviconContentType(new TextEncoder().encode("<!doctype html><script>alert(1)</script>")), null);
});
