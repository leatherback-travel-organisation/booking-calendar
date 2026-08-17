// Public guest booking page: /book?trip=<slug>&host=<host> | ?bm=<slug>.
// Exempt from Clerk (route policy) — must never look like Cove admin.

import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking-public/BookingFlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a call",
  description: "Choose a time that suits you — we'd love to talk travel.",
  referrer: "no-referrer",
  robots: { index: false },
};

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
      typeParam={first(params.type)}
      embed={first(params.embed) === "1"}
    />
  );
}
