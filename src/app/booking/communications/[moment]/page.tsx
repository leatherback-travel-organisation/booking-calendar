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

  // Brand view: one collapsible row per scope — the brand default first,
  // then every guest-facing call type, each expanding to its own full
  // editor (with preview). Nothing else on the page.
  if (selectedBrand && !typeKey) {
    const scopes = [
      { typeKey: "", name: `All call types — the ${selectedBrand.name} default` },
      ...guestTypes.map((type) => ({ typeKey: type.key, name: type.name })),
    ];
    const rowsData = await Promise.all(
      scopes.map(async (scopeEntry) => {
        const version = await resolveTemplate(moment, selectedBrand.id, scopeEntry.typeKey);
        const tailored = momentRows.some(
          (row) => row.brandKey === selectedBrand.key && (row.eventTypeKey ?? "") === scopeEntry.typeKey,
        );
        return {
          ...scopeEntry,
          tailored,
          initial: { subject: version.subject, bodyHtml: version.bodyHtml },
          source: displaySource(momentRows, moment, selectedBrand.key, scopeEntry.typeKey || null),
        };
      }),
    );

    return (
      <BookingShell active="communications" canManage={canManage}>
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 10px" }}>
            <Link href="/booking/communications" style={{ fontSize: "var(--text-small, 13px)" }}>
              ← Guest Communications
            </Link>
          </p>
          <h2 style={{ margin: 0, fontSize: "var(--text-title, 19px)", fontWeight: 500 }}>
            {MOMENT_META[moment].label} — {selectedBrand.name}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", fontSize: "var(--text-small, 13px)" }}>
            {MOMENT_META[moment].description} Call types without their own version use the{" "}
            {selectedBrand.name} default.
            {canEdit ? "" : " Read-only — editing is for Pod Leads and Senior BMs."}
          </p>
        </div>
        <ul className={listStyles.rows}>
          {rowsData.map((row) => (
            <li key={row.typeKey || "default"} className={listStyles.row} style={{ padding: 0 }}>
              <details>
                <summary style={{ cursor: "pointer", padding: "13px 16px", fontSize: "var(--text-ui, 14px)" }}>
                  <strong>{row.name}</strong>
                  <span style={{ color: "var(--ink-soft)", fontSize: "var(--text-small, 13px)" }}>
                    {" "}
                    ·{" "}
                    {row.typeKey === ""
                      ? row.tailored
                        ? "tailored for the brand"
                        : "uses the global default"
                      : row.tailored
                        ? "tailored"
                        : `uses the ${selectedBrand.name} default`}
                  </span>
                </summary>
                <div style={{ padding: "0 16px 14px" }}>
                  <TemplateEditor
                    key={`${moment}:${selectedBrand.key}:${row.typeKey}`}
                    embedded
                    moment={moment}
                    momentLabel={MOMENT_META[moment].label}
                    momentDescription={MOMENT_META[moment].description}
                    brands={brandLites}
                    typeKeys={typeKeys}
                    scope={{ brandKey: selectedBrand.key, typeKey: row.typeKey }}
                    initial={row.initial}
                    source={row.source}
                    momentRows={momentRows}
                    canManage={canEdit}
                    startInPreview={false}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </BookingShell>
    );
  }

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
