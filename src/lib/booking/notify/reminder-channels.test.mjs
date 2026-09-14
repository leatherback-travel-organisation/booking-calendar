// Run: node --experimental-strip-types --test src/lib/booking/notify/reminder-channels.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { reminderChannels } from "./reminder-channels.ts";

const flags = (o) => ({
  reminder24hEnabled: false,
  reminder1hEnabled: false,
  smsReminder24hEnabled: false,
  smsReminder1hEnabled: false,
  ...o,
});

test("each reminder has its own email and SMS switch", () => {
  const b = flags({ reminder24hEnabled: true, smsReminder1hEnabled: true });
  assert.deepEqual(reminderChannels(b, "reminder_24h", "+61400000000"), { email: true, sms: false });
  assert.deepEqual(reminderChannels(b, "reminder_1h", "+61400000000"), { email: false, sms: true });
});

test("SMS sends on its own, without the email", () => {
  const b = flags({ smsReminder24hEnabled: true });
  assert.deepEqual(reminderChannels(b, "reminder_24h", "+61400000000"), { email: false, sms: true });
});

test("SMS needs a phone number the guest left", () => {
  const b = flags({ smsReminder24hEnabled: true });
  assert.deepEqual(reminderChannels(b, "reminder_24h", null), { email: false, sms: false });
  assert.deepEqual(reminderChannels(b, "reminder_24h", "  "), { email: false, sms: false });
});
