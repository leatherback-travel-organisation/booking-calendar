import assert from "node:assert/strict";
import test from "node:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { signServiceAccountJwt } from "./auth.ts";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const KEY = {
  client_email: "booking-sa@leatherback.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

test("delegation JWT carries impersonation subject, exact calendar scopes, and a valid RS256 signature", () => {
  const now = 1_766_000_000;
  const jwt = signServiceAccountJwt(KEY, "claire@patchadventures.com.au", now);
  const [header, claims, signature] = jwt.split(".");

  assert.deepEqual(decodeSegment(header), { alg: "RS256", typ: "JWT" });
  const payload = decodeSegment(claims);
  assert.equal(payload.iss, KEY.client_email);
  assert.equal(payload.sub, "claire@patchadventures.com.au");
  assert.equal(payload.aud, "https://oauth2.googleapis.com/token");
  assert.equal(payload.iat, now);
  assert.equal(payload.exp, now + 3600);
  // Exactly the two scopes — never the broad calendar scope.
  assert.equal(
    payload.scope,
    "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
  );
  assert.ok(!payload.scope.split(" ").includes("https://www.googleapis.com/auth/calendar"));

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, "base64url")), true);
});

test("a custom token_uri becomes the audience", () => {
  const jwt = signServiceAccountJwt({ ...KEY, token_uri: "https://example.test/token" }, "x@y.com", 1);
  assert.equal(decodeSegment(jwt.split(".")[1]).aud, "https://example.test/token");
});
