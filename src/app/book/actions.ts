"use server";

// Server action used only by the brand-picker path: once the guest chooses a
// brand, load its theming, phone and guest-facing event types so the page can
// behave exactly like a resolve→pool response.

import { headers } from "next/headers";
import { getBrandByKey, getEventTypesForBrand } from "@/lib/booking/availability/service";
import { phoneForCountry } from "@/components/booking-public/phone";
import type { PublicBrand, PublicEventType } from "@/components/booking-public/types";

export type PoolResolution = {
  brand: PublicBrand;
  poolLabel: string;
  eventTypes: PublicEventType[];
} | null;

export async function resolveBrandPoolAction(brandKey: string): Promise<PoolResolution> {
  const brand = await getBrandByKey(brandKey);
  if (!brand) return null;
  const eventTypes = (await getEventTypesForBrand(brand.id)).filter((t) => t.guestFacing && t.active);
  const country = (await headers()).get("x-vercel-ip-country");
  return {
    brand: {
      key: brand.key,
      name: brand.name,
      logoUrl: brand.logoUrl,
      colorPrimary: brand.colorPrimary,
      colorAccent: brand.colorAccent,
      phone: phoneForCountry(brand, country),
    },
    poolLabel: `Book a call with the ${brand.name} team`,
    eventTypes: eventTypes.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      durationMin: t.durationMin,
    })),
  };
}
