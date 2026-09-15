// Which channels a reminder goes out on for one booking — pure, so the
// cron's decision is testable. Each reminder has its own email switch and
// its own SMS switch (Nicola, 15 Sep); either sends on its own. SMS also
// needs a phone number the guest chose to leave, and for a US-market brand
// the guest's own opt-in: those brands may only text guests who ticked the
// consent box when they booked (Nicola, 15 Sep — texting without it would
// be illegal), so a non-consenting guest simply gets no text, and no retry.

import type { Brand } from "../model";
import { maySendSms } from "../sms-consent.ts";

export type ReminderMoment = "reminder_24h" | "reminder_1h";
export type ReminderChannel = "email" | "sms";

export type ReminderFlags = Pick<
  Brand,
  "market" | "reminder24hEnabled" | "reminder1hEnabled" | "smsReminder24hEnabled" | "smsReminder1hEnabled"
>;

export function reminderChannels(
  brand: ReminderFlags,
  moment: ReminderMoment,
  guest: { phone: string | null | undefined; smsOptIn: boolean },
): { email: boolean; sms: boolean } {
  const email = moment === "reminder_24h" ? brand.reminder24hEnabled : brand.reminder1hEnabled;
  const smsWanted = moment === "reminder_24h" ? brand.smsReminder24hEnabled : brand.smsReminder1hEnabled;
  const sms =
    smsWanted && Boolean(guest.phone?.trim()) && maySendSms({ market: brand.market, smsOptIn: guest.smsOptIn });
  return { email, sms };
}
