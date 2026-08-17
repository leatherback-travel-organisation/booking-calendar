// GET /embed.js — the embeddable trip-page widget, served as plain JS.
//
// Pasted into Tourism Tiger WordPress trip pages as:
//   <script src="https://cove.leatherbacktravel.com/embed.js" data-brand="patch" defer></script>
//
// The source lives in @/lib/booking/widget-script (a pure constant) so it can
// be sanity-tested without booting a server.

import { WIDGET_SOURCE } from "@/lib/booking/widget-script";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(WIDGET_SOURCE, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
