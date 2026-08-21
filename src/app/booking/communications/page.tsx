import type { Metadata } from "next";
import { BookingShell } from "@/components/booking/booking-shell";
import { CommunicationsList } from "@/components/booking/communications/communications-list";
import { ReminderSettings } from "@/components/booking/communications/reminder-settings";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffByEmail } from "@/lib/booking/availability/service";
import { databaseConfigured } from "@/lib/booking/db";
import { MOMENTS, summarizeMoment } from "@/lib/booking/notify/template-scope.ts";
import { getBrands } from "@/lib/booking/reference/queries";
import { getActiveTemplateRows } from "./template-data";
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
  const rows = await getActiveTemplateRows(brands);
  const brandLites = brands
    .filter((brand) => brand.active)
    .map((brand) => ({ key: brand.key, name: brand.name, colorPrimary: brand.colorPrimary }));
  const summaries = MOMENTS.map((moment) => summarizeMoment(moment, rows, brandLites));

  const staffSelf = await getStaffByEmail(identity.email);
  const canEditComms = canManage || Boolean(staffSelf?.isSenior);
  const reminderBrands = brands
    .filter((brand) => brand.active)
    .map((brand) => ({
      key: brand.key,
      name: brand.name,
      colorPrimary: brand.colorPrimary,
      reminder24hEnabled: brand.reminder24hEnabled,
      reminder1hEnabled: brand.reminder1hEnabled,
      smsRemindersEnabled: brand.smsRemindersEnabled,
    }));

  return (
    <BookingShell active="communications" canManage={canManage}>
      <CommunicationsList summaries={summaries} brands={brandLites} />
      <ReminderSettings brands={reminderBrands} canEdit={canEditComms} />
    </BookingShell>
  );
}
