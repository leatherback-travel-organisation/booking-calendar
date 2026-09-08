// SMS consent for the US-market brands (Nicola, 8 Sep).
//
// US rules want express written consent before a service or marketing text:
// a box the guest ticks themselves (never pre-ticked, never required), copy
// that says who is texting, what about, how often, that rates may apply, and
// how to stop. The wording below is the same programme text Harriet, Carex
// and Salt Caravan already run on their website contact forms — one wording
// across every touch-point, so a guest who opted in on the website and one
// who opted in here agreed to the same thing.
//
// Pure and client-safe: shared by the guest form and the server that records
// what was shown.

/** Brands selling into the US collect consent; AU brands do not. Driven by
 *  brand.market so a new US brand is covered the day it is added. */
export function requiresSmsConsent(market: string | null | undefined): boolean {
  return market === "US";
}

export const SMS_CONSENT_HEADING = "SMS messaging program";
export const SMS_CONSENT_LABEL = "I agree to receive SMS messages";

/**
 * The disclosure shown beside the checkbox. Stored verbatim against the
 * booking when a guest opts in, so the record shows the wording they saw
 * rather than whatever the copy says later.
 */
export function smsConsentText(brandName: string, privacyPolicyUrl?: string | null): string {
  const core =
    `By opting in to receive text messages from ${brandName}, you agree to receive SMS messages ` +
    "related to guest care and trip-related service updates (such as document requests, booking " +
    "confirmations, and itinerary updates). Consent to receive SMS messages is not required as a " +
    "condition of making a booking or using our services. Message frequency varies depending on your " +
    "booking activity. Message and data rates may apply. To opt out at any time, reply STOP to any " +
    "message you receive from us. To request help, reply HELP.";
  const privacy = privacyPolicyUrl?.trim()
    ? ` For more information about how we handle your data, please see our Privacy Policy: ${privacyPolicyUrl.trim()}`
    : "";
  return core + privacy;
}

/**
 * Whether a text may be sent for this booking. A US brand needs the guest's
 * own opt-in — collecting consent and then texting regardless would be worse
 * than never asking. AU brands keep the brand-level setting they had.
 */
export function maySendSms(args: { market: string | null | undefined; smsOptIn: boolean }): boolean {
  return requiresSmsConsent(args.market) ? args.smsOptIn : true;
}
