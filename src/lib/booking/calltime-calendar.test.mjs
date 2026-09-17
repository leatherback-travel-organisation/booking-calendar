// Run: node --experimental-strip-types --test src/lib/booking/calltime-calendar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { canMoveBooking, isFloatingBm } from "./calltime-calendar-rules.ts";

const bm = (id, o = {}) => ({ id, active: true, calendarOk: true, brandIds: ["b1"], ...o });

test("a floating BM is an active BM with no brand", () => {
  assert.equal(isFloatingBm(bm("f", { brandIds: [] })), true);
  assert.equal(isFloatingBm(bm("j")), false);
  assert.equal(isFloatingBm(bm("x", { brandIds: [], active: false })), false);
});

test("a Pod Lead moves any call to any active BM with a working calendar", () => {
  const lead = { canManage: true, staff: null };
  assert.equal(canMoveBooking({ viewer: lead, target: bm("jax"), currentStaffId: "janie" }), true);
  assert.equal(canMoveBooking({ viewer: lead, target: bm("jax", { active: false }), currentStaffId: "janie" }), false);
  assert.equal(canMoveBooking({ viewer: lead, target: bm("jax", { calendarOk: false }), currentStaffId: "janie" }), false);
  assert.equal(canMoveBooking({ viewer: lead, target: bm("janie"), currentStaffId: "janie" }), false, "already theirs");
});

test("the floating BM moves any call onto themselves, and only onto themselves", () => {
  const floater = { canManage: false, staff: bm("flo", { brandIds: [] }) };
  assert.equal(canMoveBooking({ viewer: floater, target: bm("flo", { brandIds: [] }), currentStaffId: "janie" }), true);
  assert.equal(canMoveBooking({ viewer: floater, target: bm("jax"), currentStaffId: "janie" }), false);
});

test("an ordinary BM cannot move calls at all", () => {
  const plain = { canManage: false, staff: bm("jax") };
  assert.equal(canMoveBooking({ viewer: plain, target: bm("jax"), currentStaffId: "janie" }), false);
  assert.equal(canMoveBooking({ viewer: plain, target: bm("flo", { brandIds: [] }), currentStaffId: "janie" }), false);
});
