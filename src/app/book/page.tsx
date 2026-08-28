// Public guest booking page: /book?trip=<slug>&host=<host> | ?bm=<slug> | ?brand=<key>.
// Exempt from Clerk (route policy) — must never look like Cove admin.

import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking-public/BookingFlow";

export const dynamic = "force-dynamic";

// Brands with a current icon asset in Drive get their own favicon on their
// booking pages; the rest keep the CallTime mark (segment icon.svg).
const BRAND_FAVICONS: Record<string, string> = {
  "magnificent-explorers": "/brand-icons/magnificent-explorers.svg",
  carex: "/brand-icons/carex.svg",
  "salt-caravan": "/brand-icons/salt-caravan.png",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const brandKey = first(params.brand);
  const icon = brandKey ? BRAND_FAVICONS[brandKey] : undefined;
  return {
    title: "Book a call",
    description: "Choose a time that suits you. We'd love to talk travel.",
    referrer: "no-referrer",
    robots: { index: false },
    ...(icon ? { icons: { icon } } : {}),
  };
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <BookingFlow
      trip={first(params.trip)}
      host={first(params.host)}
      bm={first(params.bm)}
      brand={first(params.brand)}
      tripRecord={first(params.tripRecord)}
      source={first(params.source)}
      typeParam={first(params.type)}
      embed={first(params.embed) === "1"}
    />
  );
}
