// Which channels a reminder goes out on for a brand — pure, so the cron's
// decision is testable. Each reminder has its own email switch and its own
// SMS switch (Nicola, 15 Sep); either sends on its own, and SMS also needs
// a phone number the guest chose to leave.

import type { Brand } from "../model";

export type ReminderMoment = "reminder_24h" | "reminder_1h";
export type ReminderChannel = "email" | "sms";

export type ReminderFlags = Pick<
  Brand,
  "reminder24hEnabled" | "reminder1hEnabled" | "smsReminder24hEnabled" | "smsReminder1hEnabled"
>;

export function reminderChannels(
  brand: ReminderFlags,
  moment: ReminderMoment,
  guestPhone: string | null | undefined,
): { email: boolean; sms: boolean } {
  const email = moment === "reminder_24h" ? brand.reminder24hEnabled : brand.reminder1hEnabled;
  const smsWanted = moment === "reminder_24h" ? brand.smsReminder24hEnabled : brand.smsReminder1hEnabled;
  return { email, sms: smsWanted && Boolean(guestPhone?.trim()) };
}
