import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PGlite (the opt-in local demo database) ships WASM assets it locates via
  // import.meta.url — bundling it breaks that resolution, so load it natively.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The production-side migration runner reads db/*.sql at request time.
  outputFileTracingIncludes: {
    "/api/booking/cron/migrate": ["./db/*.sql"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "caminowomen.com.au" },
      { protocol: "https", hostname: "carexdesign.com" },
      { protocol: "https", hostname: "fencox.com.au" },
      { protocol: "https", hostname: "magnificentexplorers.com.au" },
      { protocol: "https", hostname: "patchadventures.com.au" },
      { protocol: "https", hostname: "cdn.prod.website-files.com" },
      { protocol: "https", hostname: "saltcaravan.com" },
      { protocol: "https", hostname: "v5.airtableusercontent.com" }
    ]
  },
  async headers() {
    return [
      {
        // Everything except /book, which the trip-page widget embeds in an
        // overlay iframe on the brand websites (frame-ancestors below).
        source: "/((?!book(?:$|/)).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" }
        ]
      },
      {
        source: "/book",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://patchadventures.com.au https://www.patchadventures.com.au https://caminowomen.com.au https://www.caminowomen.com.au https://magnificentexplorers.com.au https://www.magnificentexplorers.com.au https://magnificentrail.com.au https://www.magnificentrail.com.au https://fencox.com.au https://www.fencox.com.au https://carexdesign.com https://www.carexdesign.com https://saltcaravan.com https://www.saltcaravan.com https://saltcaravan.wetravel.com https://harrietadventures.com https://www.harrietadventures.com http://localhost:3000"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
