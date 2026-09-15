// GET /api/booking/public/contact-card-qr?brand=<key>
// A QR code that opens the brand's contact card. On a computer the vCard
// only downloads as a file (Nicola, 15 Sep: "it downloads it as a file"),
// and the call comes to the guest's phone anyway — so the confirmation page
// shows this for the phone to scan, which lands straight in add-contact.

import QRCode from "qrcode";
import { getBrandByKey } from "@/lib/booking/availability/service";
import { appUrl } from "@/lib/booking/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("brand") ?? "";
  if (!/^[a-z0-9-]{1,40}$/.test(key)) return new Response("brand is required", { status: 400 });
  const brand = await getBrandByKey(key);
  if (!brand) return new Response("unknown brand", { status: 404 });

  const target = `${appUrl()}/api/booking/public/contact-card?brand=${encodeURIComponent(brand.key)}`;
  const svg = await QRCode.toString(target, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#12312a", light: "#ffffff" },
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
