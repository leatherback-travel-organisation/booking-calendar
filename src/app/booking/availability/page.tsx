// The standalone Availability page is gone — availability now lives on each
// BM's own page under Team. Old links land on the signed-in BM's page, or
// the roster for anyone without a staff row.

import { redirect } from "next/navigation";
import { requireBookingAccess } from "@/lib/booking/access";
import { databaseConfigured } from "@/lib/booking/db";
import { getStaffWithBrands } from "@/lib/booking/reference/queries";

export const dynamic = "force-dynamic";

export default async function BookingAvailabilityPage() {
  const { identity } = await requireBookingAccess("booking.read");
  if (databaseConfigured()) {
    const selfEmail = identity.email.toLowerCase();
    const self = (await getStaffWithBrands()).find(
      (member) => member.active && member.email.toLowerCase() === selfEmail,
    );
    if (self) redirect(`/booking/team/${self.slug}`);
  }
  redirect("/booking/team");
}
