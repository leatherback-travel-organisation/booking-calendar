import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { CommunicationsList } from "@/components/booking/communications/communications-list";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffByEmail } from "@/lib/booking/availability/service";
import { databaseConfigured } from "@/lib/booking/db";
import { MOMENTS, summarizeMoment } from "@/lib/booking/notify/template-scope.ts";
import { getBrands } from "@/lib/booking/reference/queries";
import { getActiveTemplateRows } from "./template-data";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Communications · Calltime · Cove",
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

  // Editing: Pod Leads, plus BMs a Pod Lead has toggled on.
  const canEdit = canManage || Boolean((await getStaffByEmail(identity.email))?.canEditCommunications);

  const brands = await getBrands();
  const rows = await getActiveTemplateRows(brands);
  const brandLites = brands
    .filter((brand) => brand.active)
    .map((brand) => ({ key: brand.key, name: brand.name, colorPrimary: brand.colorPrimary }));
  const summaries = MOMENTS.map((moment) => summarizeMoment(moment, rows, brandLites));

  return (
    <BookingShell active="communications" canManage={canManage}>
      <CommunicationsList summaries={summaries} brands={brandLites} canManage={canEdit} />
    </BookingShell>
  );
}
