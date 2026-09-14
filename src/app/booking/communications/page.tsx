import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { CommunicationsList } from "@/components/booking/communications/communications-list";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffByEmail } from "@/lib/booking/availability/service";
import { databaseConfigured } from "@/lib/booking/db";
import { summarizeBrand } from "@/lib/booking/notify/template-scope.ts";
import { getBrands } from "@/lib/booking/reference/queries";
import { getActiveTemplateRows, getGuestFacingTypesByBrand } from "./template-data";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Communications · CallTime · Cove",
};

export default async function BookingCommunicationsPage() {
  const { identity, canManage } = await requireBookingAccess("booking.read");

  if (!databaseConfigured()) {
    return (
      <BookingShell active="communications" canManage={canManage}>
        <p className={shellStyles.placeholder}>The booking database is not configured in this environment.</p>
      </BookingShell>
    );
  }

  const brands = await getBrands();
  const activeBrands = brands.filter((brand) => brand.active);
  const [rows, typesByBrand, staffSelf] = await Promise.all([
    getActiveTemplateRows(brands),
    getGuestFacingTypesByBrand(brands),
    getStaffByEmail(identity.email),
  ]);
  // Grouped by brand (Nicola, 15 Sep): one section per brand, its messages
  // inside in the order a guest receives them, each message's call types as
  // pills, and the brand's reminder switches on the reminder rows.
  const groups = activeBrands.map((brand) => ({
    summary: summarizeBrand({ key: brand.key, name: brand.name }, rows),
    colorPrimary: brand.colorPrimary,
    callTypes: typesByBrand.get(brand.key) ?? [],
    reminder24hEnabled: brand.reminder24hEnabled,
    reminder1hEnabled: brand.reminder1hEnabled,
    smsRemindersEnabled: brand.smsRemindersEnabled,
  }));
  // Switches: Pod Leads and Senior Booking Managers; everyone else reads.
  const canEditComms = canManage || Boolean(staffSelf?.isSenior);

  return (
    <BookingShell active="communications" canManage={canManage}>
      <CommunicationsList groups={groups} canEdit={canEditComms} />
    </BookingShell>
  );
}
