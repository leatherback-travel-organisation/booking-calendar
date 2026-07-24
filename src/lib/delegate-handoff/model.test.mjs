import assert from "node:assert/strict";
import test from "node:test";
import {
  DELEGATE_HANDOFF_PROTOCOL,
  bearerToken,
  delegateActivationSchema,
  delegateMessageSchema,
} from "./model.ts";

test("delegate handoff protocol accepts only the two approved employees", () => {
  assert.equal(DELEGATE_HANDOFF_PROTOCOL, "cove-delegate-handoff/v1");
  assert.equal(delegateActivationSchema.parse({
    action: "activate",
    email: " NEVENA@LEATHERBACKTRAVEL.COM ",
    message: "LEATHERBACK DELEGATE ACTIVE",
  }).email, "nevena@leatherbacktravel.com");
  assert.equal(delegateActivationSchema.safeParse({
    action: "activate",
    email: "someone@example.com",
    message: "LEATHERBACK DELEGATE ACTIVE",
  }).success, false);
});

test("delegate messages and bearer tokens remain bounded", () => {
  assert.equal(delegateMessageSchema.parse({ action: "message", message: " github-user " }).message, "github-user");
  assert.equal(delegateMessageSchema.safeParse({ action: "message", message: "" }).success, false);
  assert.equal(bearerToken(`Bearer ${"a".repeat(32)}`), "a".repeat(32));
  assert.equal(bearerToken("Basic credential"), null);
});
