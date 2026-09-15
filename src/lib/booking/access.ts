import "server-only";

import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const BOOKING_APP_SLUG = "booking";

export type BookingAccess = {
  identity: Awaited<ReturnType<typeof requireEmployeeIdentity>>;
  /** Pod Lead — full management rights across the booking app. */
  canManage: boolean;
  permissions: readonly string[];
};

/**
 * Gate for every authed booking surface. Booking Managers hold booking.read +
 * booking.manage_own; Pod Leads additionally hold booking.manage.
 */
export async function requireBookingAccess(permission: "booking.read" | "booking.manage" | "booking.manage_own" = "booking.read"): Promise<BookingAccess> {
  const identity = await requireEmployeeIdentity();
  const access = await requireApplicationPermission(identity, BOOKING_APP_SLUG, permission);
  return {
    identity,
    canManage: access.permissions.includes("booking.manage"),
    permissions: access.permissions,
  };
}
