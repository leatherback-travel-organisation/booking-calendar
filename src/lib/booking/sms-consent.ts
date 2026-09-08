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
export const SMS_CONSENT_LABEL = "I agree to receive SMS messages about my trip";

/** Lead-in to the privacy policy link, shared by the rendered block and the
 *  stored record so the two never drift apart. */
export const SMS_CONSENT_PRIVACY_LEAD =
  "For more information about how we handle your data, please see our ";

/**
 * The body of the disclosure, without the privacy policy sentence. The form
 * renders this and then the policy as a real link; the stored record spells
 * the URL out instead (see smsConsentText).
 */
export function smsConsentCore(brandName: string): string {
  return (
    "We\u2019ll never use SMS for marketing purposes. " +
    `By opting in to receive text messages from ${brandName}, you agree to receive SMS messages ` +
    "related to guest care and trip-related service updates (such as document requests, booking " +
    "confirmations, and itinerary updates). Consent to receive SMS messages is not required as a " +
    "condition of making a booking or using our services. Message frequency varies depending on your " +
    "booking activity. Message and data rates may apply. To opt out at any time, reply STOP to any " +
    "message you receive from us. To request help, reply HELP."
  );
}

/**
 * The disclosure as plain text, with the policy URL written out. Stored
 * verbatim against the booking when a guest opts in, so the record shows what
 * they agreed to rather than whatever the copy says later.
 */
export function smsConsentText(brandName: string, privacyPolicyUrl?: string | null): string {
  const url = privacyPolicyUrl?.trim();
  return smsConsentCore(brandName) + (url ? ` ${SMS_CONSENT_PRIVACY_LEAD}Privacy Policy: ${url}` : "");
}

/**
 * Whether a text may be sent for this booking. A US brand needs the guest's
 * own opt-in — collecting consent and then texting regardless would be worse
 * than never asking. AU brands keep the brand-level setting they had.
 */
export function maySendSms(args: { market: string | null | undefined; smsOptIn: boolean }): boolean {
  return requiresSmsConsent(args.market) ? args.smsOptIn : true;
}
