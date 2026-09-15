// Run: node --experimental-strip-types --test src/lib/booking/notify/reminder-channels.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderChannels } from "./reminder-channels.ts";

const flags = (o) => ({
  market: "AU",
  reminder24hEnabled: false,
  reminder1hEnabled: false,
  smsReminder24hEnabled: false,
  smsReminder1hEnabled: false,
  ...o,
});
const guest = (o) => ({ phone: "+61400000000", smsOptIn: false, ...o });

test("each reminder has its own email and SMS switch", () => {
  const b = flags({ reminder24hEnabled: true, smsReminder1hEnabled: true });
  assert.deepEqual(reminderChannels(b, "reminder_24h", guest()), { email: true, sms: false });
  assert.deepEqual(reminderChannels(b, "reminder_1h", guest()), { email: false, sms: true });
});

test("SMS sends on its own, without the email", () => {
  const b = flags({ smsReminder24hEnabled: true });
  assert.deepEqual(reminderChannels(b, "reminder_24h", guest()), { email: false, sms: true });
});

test("SMS needs a phone number the guest left", () => {
  const b = flags({ smsReminder24hEnabled: true });
  assert.deepEqual(reminderChannels(b, "reminder_24h", guest({ phone: null })), { email: false, sms: false });
  assert.deepEqual(reminderChannels(b, "reminder_24h", guest({ phone: "  " })), { email: false, sms: false });
});

test("a US brand texts only guests who opted in; AU brands need no opt-in", () => {
  const us = flags({ market: "US", smsReminder24hEnabled: true, reminder24hEnabled: true });
  assert.deepEqual(reminderChannels(us, "reminder_24h", guest({ smsOptIn: false })), { email: true, sms: false });
  assert.deepEqual(reminderChannels(us, "reminder_24h", guest({ smsOptIn: true })), { email: true, sms: true });
  const au = flags({ market: "AU", smsReminder24hEnabled: true });
  assert.deepEqual(reminderChannels(au, "reminder_24h", guest({ smsOptIn: false })), { email: false, sms: true });
});

test("a non-consenting US guest on an SMS-only reminder gets nothing, and nothing to retry", () => {
  const us = flags({ market: "US", smsReminder1hEnabled: true });
  assert.deepEqual(reminderChannels(us, "reminder_1h", guest({ smsOptIn: false })), { email: false, sms: false });
});
