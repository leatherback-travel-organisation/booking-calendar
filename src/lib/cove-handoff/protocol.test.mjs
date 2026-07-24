import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  COVE_HANDOFF_TTL_SECONDS,
  createCoveHandoffTicket,
  verifyCoveHandoffTicket,
} from "./protocol.ts";

const secret = "production-strength-secret-material-for-tests";
const nowSeconds = 1_785_000_000;
const nonce = "a3b94d1e-7a77-4b81-8fac-25c5cabda3e0";
const applicationSlug = "octomancer";

function validTicket() {
  return createCoveHandoffTicket({
    applicationSlug,
    userId: "user-123",
    email: "employee@leatherbacktravel.com",
    population: "team",
    nowSeconds,
    nonce,
  }, secret);
}

function ticketForClaims(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

test("creates and verifies an application-bound short-lived ticket", () => {
  const ticket = validTicket();
  const claims = verifyCoveHandoffTicket({
    ticket,
    applicationSlug,
    secret,
    nowSeconds,
  });

  assert.equal(claims?.applicationSlug, applicationSlug);
  assert.equal(claims?.userId, "user-123");
  assert.equal(claims?.exp, nowSeconds + COVE_HANDOFF_TTL_SECONDS);
});

test("rejects tampered signatures and another application's ticket", () => {
  const ticket = validTicket();
  assert.equal(verifyCoveHandoffTicket({
    ticket: `${ticket.slice(0, -1)}x`,
    applicationSlug,
    secret,
    nowSeconds,
  }), null);
  assert.equal(verifyCoveHandoffTicket({
    ticket,
    applicationSlug: "nest",
    secret,
    nowSeconds,
  }), null);
});

test("rejects expired and implausibly future-dated tickets", () => {
  const baseline = {
    v: 1,
    applicationSlug,
    userId: "user-123",
    email: "employee@leatherbacktravel.com",
    population: "team",
    nonce,
  };
  assert.equal(verifyCoveHandoffTicket({
    ticket: ticketForClaims({ ...baseline, exp: nowSeconds - 1 }),
    applicationSlug,
    secret,
    nowSeconds,
  }), null);
  assert.equal(verifyCoveHandoffTicket({
    ticket: ticketForClaims({ ...baseline, exp: nowSeconds + 91 }),
    applicationSlug,
    secret,
    nowSeconds,
  }), null);
});

test("fails closed when the sole Cove signing secret is unavailable", () => {
  assert.equal(verifyCoveHandoffTicket({
    ticket: validTicket(),
    applicationSlug,
    secret: "",
    nowSeconds,
  }), null);
});
