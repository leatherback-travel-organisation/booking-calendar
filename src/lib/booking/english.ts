// Carex, Salt Caravan and Harriet sell to American guests — their
// communications and guest touch-points use American English (Nicola, 1 Sep).
// Pure and client-safe: shared by guest UI components and server templates.

export const AMERICAN_ENGLISH_BRAND_KEYS = new Set(["carex", "salt-caravan", "harriet"]);

export function usesAmericanEnglish(brandKey: string | null | undefined): boolean {
  return brandKey != null && AMERICAN_ENGLISH_BRAND_KEYS.has(brandKey);
}
