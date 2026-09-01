// Public guest booking page: /book?trip=<slug>&host=<host> | ?bm=<slug> | ?brand=<key>.
// Exempt from Clerk (route policy) — must never look like Cove admin.

import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking-public/BookingFlow";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  // Every brand's avatar is synced from the Brands base; brand links use it
  // directly, BM links resolve the BM's primary brand first.
  let brandKey = first(params.brand);
  const bm = first(params.bm);
  if (!brandKey && bm) {
    try {
      const { getStaffBySlug, getBrandById } = await import("@/lib/booking/availability/service");
      const staff = await getStaffBySlug(bm);
      const brand = staff?.primaryBrandId ? await getBrandById(staff.primaryBrandId) : null;
      brandKey = brand?.key ?? null;
    } catch {
      brandKey = null;
    }
  }
  const icon = brandKey ? `/api/booking/brand-avatar/${encodeURIComponent(brandKey)}` : undefined;
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
      hero={first(params.hero)}
      embed={first(params.embed) === "1"}
    />
  );
}
