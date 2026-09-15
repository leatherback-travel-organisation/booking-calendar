// Geo-aware support phone selection, mirroring supportPhone() in
// @/lib/booking/public-api but usable from server components/actions that
// have a country code from next/headers rather than a Request.

type PhoneBrand = {
  phoneAu: string | null;
  phoneNz: string | null;
  phoneDefault: string | null;
};

export function phoneForCountry(brand: PhoneBrand, country: string | null | undefined): string | null {
  const code = country?.toUpperCase();
  if (code === "AU") return brand.phoneAu ?? brand.phoneDefault;
  if (code === "NZ") return brand.phoneNz ?? brand.phoneAu ?? brand.phoneDefault;
  return brand.phoneDefault ?? brand.phoneAu;
}
