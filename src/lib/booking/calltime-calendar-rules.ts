// Pure rules for CallTime Cal: who is floating, who may move a call. No IO,
// so plain node --test covers them.

import type { Staff } from "./model";

/**
 * The floating Booking Manager: a cover BM with no brand of their own, there
 * to take any brand's calls when the allocated BM is away (Nicola, 17 Sep).
 * Derived from the roster rather than a flag — an active BM with no brand is
 * floating by definition.
 */
export function isFloatingBm(staff: Pick<Staff, "active" | "brandIds">): boolean {
  return staff.active && staff.brandIds.length === 0;
}

/**
 * Who may move a booking to another BM (Nicola, 17 Sep): Pod Leads move any
 * call to anyone; the floating BM moves any call onto themselves. Nobody
 * else, and never onto an inactive BM or one whose calendar is unreachable.
 */
export function canMoveBooking(args: {
  viewer: { canManage: boolean; staff: Pick<Staff, "id" | "active" | "brandIds"> | null };
  target: Pick<Staff, "id" | "active" | "calendarOk">;
  currentStaffId: string;
}): boolean {
  const { viewer, target, currentStaffId } = args;
  if (!target.active || !target.calendarOk) return false;
  if (target.id === currentStaffId) return false;
  if (viewer.canManage) return true;
  const self = viewer.staff;
  if (!self || !isFloatingBm(self)) return false;
  return target.id === self.id;
}
