// Carex, Salt Caravan and Harriet sell to American guests — their
// communications and guest touch-points use American English (Nicola, 1 Sep).
// Pure and client-safe: shared by guest UI components and server templates.

export const AMERICAN_ENGLISH_BRAND_KEYS = new Set(["carex", "salt-caravan", "harriet"]);

export function usesAmericanEnglish(brandKey: string | null | undefined): boolean {
  return brandKey != null && AMERICAN_ENGLISH_BRAND_KEYS.has(brandKey);
}

/**
 * British → American spellings, for the US-market brands' guest copy.
 *
 * SPELLING ONLY. Word choices that change voice — whilst/while,
 * amongst/among, learnt/learned — are left alone: those are the writer's, not
 * a spelling error.
 *
 * Applied to TEMPLATE text before variables are substituted, so a guest
 * called Grey, or an address with "centre" in it, is never rewritten.
 */
const US_SPELLINGS: [RegExp, string][] = (
  [
    ["cancelling", "canceling"], ["cancelled", "canceled"],
    ["enquiries", "inquiries"], ["enquiry", "inquiry"], ["enquiring", "inquiring"], ["enquire", "inquire"],
    ["favourite", "favorite"], ["favour", "favor"], ["colour", "color"],
    ["honour", "honor"], ["behaviour", "behavior"], ["neighbour", "neighbor"], ["labour", "labor"],
    ["organisation", "organization"], ["organise", "organize"], ["organised", "organized"], ["organising", "organizing"],
    ["apologise", "apologize"], ["apologised", "apologized"],
    ["realise", "realize"], ["realised", "realized"], ["recognise", "recognize"], ["recognised", "recognized"],
    ["personalise", "personalize"], ["personalised", "personalized"],
    ["customise", "customize"], ["customised", "customized"],
    ["specialise", "specialize"], ["specialised", "specialized"],
    ["travelling", "traveling"], ["travelled", "traveled"], ["travellers", "travelers"], ["traveller", "traveler"],
    ["centre", "center"], ["theatre", "theater"], ["metres", "meters"], ["metre", "meter"],
    ["programme", "program"], ["catalogue", "catalog"], ["dialogue", "dialog"],
    ["licence", "license"], ["defence", "defense"], ["offence", "offense"], ["pretence", "pretense"],
    ["practise", "practice"], ["analyse", "analyze"], ["paralyse", "paralyze"],
    ["jewellery", "jewelry"], ["aluminium", "aluminum"], ["grey", "gray"],
    ["fulfil", "fulfill"], ["enrol", "enroll"], ["instalment", "installment"], ["skilful", "skillful"],
    ["marvellous", "marvelous"], ["labelled", "labeled"], ["modelling", "modeling"], ["signalling", "signaling"],
  ] as [string, string][]
).map(([uk, us]) => [new RegExp(`\\b${uk}\\b`, "gi"), us]);

/** Match the source word's capitalisation: Cancelled → Canceled, FAVOURITE → FAVORITE. */
function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function toAmericanEnglish(text: string): string {
  let out = text;
  for (const [pattern, us] of US_SPELLINGS) {
    out = out.replace(pattern, (match) => matchCase(match, us));
  }
  return out;
}
