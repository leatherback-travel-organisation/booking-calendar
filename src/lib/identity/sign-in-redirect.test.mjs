import assert from "node:assert/strict";
import test from "node:test";
import { resolveSignInRedirect } from "./sign-in-redirect.ts";

const satellites = [
  "https://trtl.leatherbacktravel.com",
  "https://answers.leatherbacktravel.com",
];

test("keeps a Clerk satellite sync return URL intact", () => {
  assert.equal(
    resolveSignInRedirect(
      "https://trtl.leatherbacktravel.com/?__clerk_synced=false",
      satellites,
    ),
    "https://trtl.leatherbacktravel.com/?__clerk_synced=false",
  );
});

test("keeps safe Cove-relative return paths", () => {
  assert.equal(resolveSignInRedirect("/systems/control-room", satellites), "/systems/control-room");
});

test("rejects unregistered, insecure and protocol-relative destinations", () => {
  assert.equal(resolveSignInRedirect("https://example.com/steal", satellites), "/");
  assert.equal(resolveSignInRedirect("http://trtl.leatherbacktravel.com/", satellites), "/");
  assert.equal(resolveSignInRedirect("//example.com/steal", satellites), "/");
});
