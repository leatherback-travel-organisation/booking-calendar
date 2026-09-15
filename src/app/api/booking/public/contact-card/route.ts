// GET /api/booking/public/contact-card?brand=<key>
// The brand as a contact card, for the "save our number" button on the
// booking confirmation (Nicola, 15 Sep). Served inline as text/vcard: iOS
// opens it straight into the add-contact sheet with every field filled, and
// Android hands it to Contacts the same way. No guest data in or out.

import { getBrandByKey } from "@/lib/booking/availability/service";
import { getSql } from "@/lib/booking/db";
import { buildContactCard, contactCardFileName } from "@/lib/booking/contact-card";
import { supportPhone } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("brand") ?? "";
  if (!/^[a-z0-9-]{1,40}$/.test(key)) return new Response("brand is required", { status: 400 });
  const brand = await getBrandByKey(key);
  if (!brand) return new Response("unknown brand", { status: 404 });

  // The number the guest will be called from first, then the brand's other
  // lines so a call from any of them is recognised.
  const main = supportPhone(brand, request);
  const phones: Array<{ label: string; number: string }> = [];
  const seen = new Set<string>();
  for (const [label, number] of [
    ["main", main],
    ["default", brand.phoneDefault],
    ["au", brand.phoneAu],
    ["nz", brand.phoneNz],
  ] as const) {
    const digits = number?.replace(/[^\d+]/g, "") ?? "";
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    phones.push({ label: phones.length === 0 ? "main" : label, number: digits });
  }

  const sql = getSql();
  const hosts = await sql`select host from booking.brand_domain where brand_id = ${brand.id} order by length(host), host limit 1`;
  const host = hosts.length ? String(hosts[0].host) : null;

  const card = buildContactCard({
    name: brand.name,
    email: brand.replyTo ?? brand.fromEmail,
    phones,
    website: host ? `https://${host}` : null,
    photoUrl: brand.logoUrl,
    note: `Your ${brand.name} Booking Manager calls from this number.`,
  });

  return new Response(card, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `inline; filename="${contactCardFileName(brand.name)}"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
