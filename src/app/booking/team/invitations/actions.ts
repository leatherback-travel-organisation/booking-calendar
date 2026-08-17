"use server";

// Invitation (shortlist) actions. Same permission rule as sessions: Pod
// Leads act for anyone, Booking Managers only for themselves — enforced
// here, server-side.

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import type { InviteActionState } from "@/components/booking/team-tools/invitation-composer";
import { requireBookingAccess } from "@/lib/booking/access";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { createInvitation } from "@/lib/booking/invitations";
import type { Interval } from "@/lib/booking/model";

const MIN_PICKS = 2;
const MAX_PICKS = 5;

export async function createInvitationAction(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  try {
    const access = await requireBookingAccess("booking.read");

    const staff = await getStaffById(String(formData.get("staffId") ?? ""));
    if (!staff || !staff.active) return { status: "error", message: "Unknown staff member." };
    if (!access.canManage && staff.email.toLowerCase() !== access.identity.email.toLowerCase()) {
      return { status: "error", message: "You can only create invitations for yourself." };
    }

    const eventType = await getEventTypeById(String(formData.get("eventTypeId") ?? ""));
    if (!eventType || !eventType.active) return { status: "error", message: "Pick an event type." };
    const brand = await getBrandById(eventType.brandId);
    if (!brand) return { status: "error", message: "Unknown brand." };
    if (staff.primaryBrandId !== brand.id && !staff.brandIds.includes(brand.id)) {
      return { status: "error", message: `${staff.firstName} does not work ${brand.name}.` };
    }

    const starts = formData.getAll("candidate").map(String);
    if (starts.length < MIN_PICKS || starts.length > MAX_PICKS) {
      return { status: "error", message: `Pick between ${MIN_PICKS} and ${MAX_PICKS} candidate times.` };
    }
    const candidates: Interval[] = [];
    for (const startIso of starts) {
      const start = DateTime.fromISO(startIso);
      if (!start.isValid || start.toMillis() <= Date.now()) {
        return { status: "error", message: "One of the chosen times is no longer valid — refresh and pick again." };
      }
      candidates.push({
        start: start.toUTC().toISO() ?? startIso,
        end: start.plus({ minutes: eventType.durationMin }).toUTC().toISO() ?? startIso,
      });
    }
    candidates.sort((a, b) => a.start.localeCompare(b.start));

    const guestNameRaw = formData.get("guestName");
    const guestName = typeof guestNameRaw === "string" && guestNameRaw.trim().length > 0 ? guestNameRaw.trim() : null;
    const guestEmailRaw = formData.get("guestEmail");
    const guestEmail =
      typeof guestEmailRaw === "string" && guestEmailRaw.trim().length > 0 ? guestEmailRaw.trim().toLowerCase() : null;
    if (guestEmail && !/^\S+@\S+\.\S+$/.test(guestEmail)) {
      return { status: "error", message: "That guest email does not look valid." };
    }

    const { url } = await createInvitation({
      staff,
      eventType,
      candidates,
      guestName,
      guestEmail,
      actorEmail: access.identity.email,
    });
    revalidatePath("/booking/team/invitations");
    return { status: "created", url };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
}
