// Pure line-selection helpers for Aircall click-to-dial. NZ guests are
// called from the brand's NZ number; AU guests from the AU number.

/** Guest region from the dialling prefix. Pure — unit tested. */
export function regionForPhone(phone: string): "NZ" | "AU" | null {
  const trimmed = phone.replace(/[\s()-]/g, "");
  if (trimmed.startsWith("+64") || trimmed.startsWith("0064")) return "NZ";
  if (trimmed.startsWith("+61") || trimmed.startsWith("0061")) return "AU";
  // Bare national format: the guest typed it on an AU-market site.
  if (/^0[2-9]\d{8}$/.test(trimmed)) return "AU";
  return null;
}

export function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

export type BrandLines = {
  phoneAu: string | null;
  phoneNz: string | null;
  phoneDefault: string | null;
};

/** Which of the brand's lines should place this call. Pure — unit tested. */
export function pickLine(guestPhone: string, lines: BrandLines): { region: "NZ" | "AU" | "default"; number: string | null } {
  const region = regionForPhone(guestPhone);
  if (region === "NZ" && lines.phoneNz) return { region: "NZ", number: lines.phoneNz };
  if (region === "AU" && lines.phoneAu) return { region: "AU", number: lines.phoneAu };
  if (region === "NZ" && lines.phoneAu) return { region: "AU", number: lines.phoneAu };
  return { region: "default", number: lines.phoneDefault ?? lines.phoneAu };
}

