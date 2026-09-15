-- Text-message reminders become a per-reminder setting, beside the email
-- one (Nicola, 15 Sep: "two columns, one for SMS one for email").
--
-- Until now one brand flag (sms_reminders_enabled) covered both reminders
-- and SMS could only ride along with an email that was itself switched on.
-- Now each reminder has its own email switch and its own SMS switch, and
-- either channel sends on its own. The old column stays for history but is
-- no longer read; its value seeds both new ones so nothing changes today.
alter table booking.brand
  add column if not exists sms_reminder_24h_enabled boolean not null default false,
  add column if not exists sms_reminder_1h_enabled boolean not null default false;

update booking.brand
   set sms_reminder_24h_enabled = sms_reminders_enabled,
       sms_reminder_1h_enabled = sms_reminders_enabled
 where sms_reminders_enabled;
