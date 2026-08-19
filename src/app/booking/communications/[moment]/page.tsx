import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingShell } from "@/components/booking/booking-shell";
import { TemplateEditor } from "@/components/booking/communications/template-editor";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffByEmail } from "@/lib/booking/availability/service";
import { databaseConfigured } from "@/lib/booking/db";
import { resolveTemplate } from "@/lib/booking/notify/messages";
import { displaySource, isMoment, MOMENT_META } from "@/lib/booking/notify/template-scope.ts";
import { getBrands } from "@/lib/booking/reference/queries";
import { getActiveTemplateRows, getGuestFacingTypeKeys } from "../template-data";
import shellStyles from "@/components/booking/booking-shell.module.css";

export const dynamic = "force-dynamic";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

type PageProps = {
  params: Promise<{ moment: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moment } = await params;
  if (!isMoment(moment)) return { title: "Communications · Calltime · Cove" };
  return { title: `${MOMENT_META[moment].label} · Communications · Calltime · Cove` };
}

export default async function TemplateEditorPage({ params, searchParams }: PageProps) {
  const { moment } = await params;
  if (!isMoment(moment)) notFound();

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

  const query = await searchParams;
  const requestedBrand = typeof query.brand === "string" ? query.brand : "";
  const requestedType = typeof query.type === "string" ? query.type : "";
  const startInPreview = query.preview === "1";

  const [brands, typeKeys] = await Promise.all([getBrands(), getGuestFacingTypeKeys()]);
  const activeBrands = brands.filter((brand) => brand.active);

  const selectedBrand = activeBrands.find((brand) => brand.key === requestedBrand) ?? null;
  const brandKey = selectedBrand?.key ?? "";
  const typeKey = typeKeys.includes(requestedType) ? requestedType : "";

  const [rows, resolved] = await Promise.all([
    getActiveTemplateRows(brands),
    resolveTemplate(moment, selectedBrand?.id ?? ZERO_UUID, typeKey),
  ]);
  const momentRows = rows.filter((row) => row.moment === moment);
  const brandLites = activeBrands.map((brand) => ({ key: brand.key, name: brand.name }));
  const source = displaySource(momentRows, moment, brandKey || null, typeKey || null);

  return (
    <BookingShell active="communications" canManage={canManage}>
      <TemplateEditor
        key={`${moment}:${brandKey}:${typeKey}`}
        moment={moment}
        momentLabel={MOMENT_META[moment].label}
        momentDescription={MOMENT_META[moment].description}
        brands={brandLites}
        typeKeys={typeKeys}
        scope={{ brandKey, typeKey }}
        initial={{ subject: resolved.subject, bodyHtml: resolved.bodyHtml }}
        source={source}
        momentRows={momentRows}
        canManage={canEdit}
        startInPreview={startInPreview}
      />
    </BookingShell>
  );
}
