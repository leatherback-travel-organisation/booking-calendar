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

  // The public inbox the brand publishes, never the app's sending address.
  const email = brand.contactEmail ?? brand.replyTo ?? brand.fromEmail;
  // The website: the domain the contact address lives on when the brand
  // has more than one (Magnificent still answers on magnificentrail.com.au),
  // else the shortest host.
  const sql = getSql();
  const hosts = (await sql`select host from booking.brand_domain where brand_id = ${brand.id} order by length(host), host`).map((row) => String(row.host));
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
  const host = hosts.find((h) => h.toLowerCase() === emailDomain) ?? hosts[0] ?? null;

  // The brand's square avatar (Brands base "Avatar", blob-hosted), embedded:
  // it becomes the contact photo, and so the sender avatar in the guest's
  // mail app. Phones do not fetch a photo by URL from a vCard, so a link
  // would show nothing. Skipped when missing or unreasonably large.
  let photo: { contentType: string; base64: string } | null = null;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const rows = await sql`select payload from booking.reference_cache where key = ${"brand-avatar:" + brand.id}`;
    const payload = (rows[0]?.payload ?? null) as { blobUrl?: string; contentType?: string } | null;
    if (payload?.blobUrl) {
      try {
        const blob = await fetch(payload.blobUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (blob.ok) {
          const bytes = Buffer.from(await blob.arrayBuffer());
          if (bytes.byteLength <= 400_000) {
            photo = { contentType: payload.contentType ?? "image/png", base64: bytes.toString("base64") };
          }
        }
      } catch {
        photo = null;
      }
    }
  }

  const card = buildContactCard({
    name: brand.name,
    email,
    phones,
    website: host ? `https://${host}` : null,
    photo,
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
