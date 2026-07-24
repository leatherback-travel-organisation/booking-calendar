import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" }
        ]
      }
    ];
  }
};

export default nextConfig;
