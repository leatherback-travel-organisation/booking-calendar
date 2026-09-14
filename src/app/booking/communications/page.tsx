import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { CommunicationsList } from "@/components/booking/communications/communications-list";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffByEmail } from "@/lib/booking/availability/service";
import { databaseConfigured } from "@/lib/booking/db";
import { summarizeBrand } from "@/lib/booking/notify/template-scope.ts";
import { getBrands, getPods } from "@/lib/booking/reference/queries";
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
  const [rows, typesByBrand, staffSelf, pods] = await Promise.all([
    getActiveTemplateRows(brands),
    getGuestFacingTypesByBrand(brands),
    getStaffByEmail(identity.email),
    getPods(),
  ]);
  // Grouped by brand (Nicola, 15 Sep): one section per brand, its messages
  // inside in the order a guest receives them, each message's call types as
  // pills, and the brand's reminder switches on the reminder rows.
  const groupFor = (brand: (typeof activeBrands)[number]) => ({
    summary: summarizeBrand({ key: brand.key, name: brand.name }, rows),
    colorPrimary: brand.colorPrimary,
    callTypes: typesByBrand.get(brand.key) ?? [],
    reminder24hEnabled: brand.reminder24hEnabled,
    reminder1hEnabled: brand.reminder1hEnabled,
    smsReminder24hEnabled: brand.smsReminder24hEnabled,
    smsReminder1hEnabled: brand.smsReminder1hEnabled,
  });
  // Grouped by pod (Nicola, 15 Sep), a brand under the first pod that has
  // it; brands outside every pod come last under their own heading.
  const placed = new Set<string>();
  const podSections = pods
    .map((pod) => {
      const members = activeBrands.filter((brand) => pod.brandIds.includes(brand.id) && !placed.has(brand.id));
      members.forEach((brand) => placed.add(brand.id));
      return { key: pod.key, name: pod.name, groups: members.map(groupFor) };
    })
    .filter((section) => section.groups.length > 0);
  const unplaced = activeBrands.filter((brand) => !placed.has(brand.id));
  if (unplaced.length > 0) {
    podSections.push({
      key: "other",
      name: podSections.length > 0 ? "Other brands" : "All brands",
      groups: unplaced.map(groupFor),
    });
  }
  // Switches: Pod Leads and Senior Booking Managers; everyone else reads.
  const canEditComms = canManage || Boolean(staffSelf?.isSenior);

  return (
    <BookingShell active="communications" canManage={canManage}>
      <CommunicationsList pods={podSections} canEdit={canEditComms} />
    </BookingShell>
  );
}
