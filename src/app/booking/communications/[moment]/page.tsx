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
import Link from "next/link";
import { getActiveTemplateRows, getGuestFacingTypeKeys, getGuestFacingTypes } from "../template-data";
import shellStyles from "@/components/booking/booking-shell.module.css";
import listStyles from "@/components/booking/communications/communications-list.module.css";

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

  // Editing: Pod Leads and Senior Booking Managers (title synced from Notion).
  const canEdit = canManage || Boolean((await getStaffByEmail(identity.email))?.isSenior);

  const query = await searchParams;
  const requestedBrand = typeof query.brand === "string" ? query.brand : "";
  const requestedType = typeof query.type === "string" ? query.type : "";
  const startInPreview = query.preview === "1";

  const [brands, typeKeys] = await Promise.all([getBrands(), getGuestFacingTypeKeys()]);
  const activeBrands = brands.filter((brand) => brand.active);

  const selectedBrand = activeBrands.find((brand) => brand.key === requestedBrand) ?? null;
  const brandKey = selectedBrand?.key ?? "";
  const typeKey = typeKeys.includes(requestedType) ? requestedType : "";

  const [rows, resolved, guestTypes] = await Promise.all([
    getActiveTemplateRows(brands),
    resolveTemplate(moment, selectedBrand?.id ?? ZERO_UUID, typeKey),
    getGuestFacingTypes(),
  ]);
  const momentRows = rows.filter((row) => row.moment === moment);
  const brandLites = activeBrands.map((brand) => ({ key: brand.key, name: brand.name }));
  const source = displaySource(momentRows, moment, brandKey || null, typeKey || null);

  // Per-call-type versions for the collapsible list (brand view only):
  // resolution + tailored flag for each guest-facing type of this brand.
  const typeVersions =
    selectedBrand && !typeKey
      ? await Promise.all(
          guestTypes.map(async (type) => {
            const version = await resolveTemplate(moment, selectedBrand.id, type.key);
            const tailored = momentRows.some(
              (row) => row.brandKey === selectedBrand.key && row.eventTypeKey === type.key,
            );
            return { ...type, tailored, subject: version.subject };
          }),
        )
      : [];
  const selectedTypeName = typeKey ? (guestTypes.find((type) => type.key === typeKey)?.name ?? typeKey) : null;

  return (
    <BookingShell active="communications" canManage={canManage}>
      {selectedBrand && selectedTypeName ? (
        <p style={{ margin: "0 0 12px", fontSize: "var(--text-small, 13px)" }}>
          Editing the <strong>{selectedTypeName}</strong> version ·{" "}
          <Link href={`/booking/communications/${moment}?brand=${encodeURIComponent(selectedBrand.key)}`}>
            back to the {selectedBrand.name} version
          </Link>
        </p>
      ) : null}
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
      {selectedBrand && !typeKey ? (
        <section className={listStyles.stage} style={{ marginTop: 18 }}>
          <h2 className={listStyles.stageTitle}>By call type</h2>
          <ul className={listStyles.rows}>
            <li className={listStyles.row}>
              <p className={listStyles.rowDescription} style={{ marginTop: 0 }}>
                Each call type can carry its own {MOMENT_META[moment].label.toLowerCase()} for{" "}
                {selectedBrand.name}. Types without their own version use the {selectedBrand.name} version
                above.
              </p>
              {typeVersions.map((type) => (
                <details key={type.key} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <summary style={{ cursor: "pointer", fontSize: "var(--text-ui, 14px)" }}>
                    <strong>{type.name}</strong>
                    <span style={{ color: "var(--ink-soft)", fontSize: "var(--text-small, 13px)" }}>
                      {" "}
                      · {type.tailored ? "tailored" : `uses the ${selectedBrand.name} version`}
                    </span>
                  </summary>
                  <div style={{ padding: "8px 0 10px 18px", display: "grid", gap: 6 }}>
                    <p style={{ margin: 0, fontSize: "var(--text-small, 13px)", color: "var(--ink-soft)" }}>
                      Subject: {type.subject}
                    </p>
                    <p style={{ margin: 0 }}>
                      <Link
                        href={`/booking/communications/${moment}?brand=${encodeURIComponent(selectedBrand.key)}&type=${encodeURIComponent(type.key)}`}
                        className={listStyles.brandLink}
                        data-tailored={type.tailored || undefined}
                      >
                        {canEdit ? `Edit the ${type.name} version` : `View the ${type.name} version`}
                      </Link>
                    </p>
                  </div>
                </details>
              ))}
            </li>
          </ul>
        </section>
      ) : null}
    </BookingShell>
  );
}
