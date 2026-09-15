// Guest self-service page: /manage/<token>. The token is the only credential;
// an unknown token gets a deliberately generic answer with no detail.

import type { Metadata } from "next";
import { guestEventTypeName } from "@/lib/booking/model";
import { headers } from "next/headers";
import { bookingManageable, findBookingByToken } from "@/lib/booking/service";
import { getBrandById, getEventTypeById, getStaffById } from "@/lib/booking/availability/service";
import { BrandFrame } from "@/components/booking-public/BrandFrame";
import { ManagePanel } from "@/components/booking-public/ManagePanel";
import { phoneForCountry } from "@/components/booking-public/phone";
import styles from "@/components/booking-public/bp.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage your booking",
  referrer: "no-referrer",
  robots: { index: false },
};

function InvalidLink() {
  return (
    <BrandFrame brand={null}>
      <section className={styles.card}>
        <h1 className={styles.pageTitle}>This link isn&rsquo;t valid</h1>
        <p className={styles.pageSub}>
          Please use the manage link from your confirmation email. If you&rsquo;re stuck, reply to that
          email and we&rsquo;ll help you out.
        </p>
      </section>
    </BrandFrame>
  );
}

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let rawToken = token;
  try {
    rawToken = decodeURIComponent(token);
  } catch {
    // Keep the raw path segment; findBookingByToken will reject it.
  }

  // Tokens are bearer credentials: ~10 lookup attempts per IP per minute.
  const headerList = await headers();
  const ip = headerList.get("x-real-ip") ?? headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { rateLimited } = await import("@/lib/booking/public-api");
  if (await rateLimited("manage-ip", ip, 10, 60)) {
    return <InvalidLink />;
  }

  const booking = await findBookingByToken(rawToken);
  if (!booking) return <InvalidLink />;

  const [staff, brand, eventType] = await Promise.all([
    getStaffById(booking.staffId),
    getBrandById(booking.brandId),
    getEventTypeById(booking.eventTypeId),
  ]);
  if (!staff || !brand || !eventType) return <InvalidLink />;

  const country = (await headers()).get("x-vercel-ip-country");
  const state = bookingManageable(booking)
    ? "manageable"
    : booking.status === "confirmed"
      ? "past"
      : "cancelled";

  return (
    <ManagePanel
      token={rawToken}
      state={state}
      booking={{
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        guestName: booking.guestName,
        guestTimezone: booking.guestTimezone,
        meetUrl: booking.meetUrl,
      }}
      staff={{ slug: staff.slug, firstName: staff.firstName, photoUrl: staff.photoUrl }}
      brand={{
        key: brand.key,
        name: brand.name,
        logoUrl: brand.logoUrl,
        colorPrimary: brand.colorPrimary,
        colorAccent: brand.colorAccent,
        phone: phoneForCountry(brand, country),
      }}
      eventType={{ key: eventType.key, name: guestEventTypeName(eventType.key, eventType.name), durationMin: eventType.durationMin }}
    />
  );
}
