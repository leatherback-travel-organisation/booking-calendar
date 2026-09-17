-- CallTime Cal (Nicola, 17 Sep): one shared Google calendar holding every
-- booked call, worked the way the team already works the HR calendar — one
-- event, edit it there and it changes for everyone. The Booking Manager
-- taking the call is a guest on the event, so it still shows on their own
-- calendar and marks them busy. When a BM has unplanned leave, a Pod Lead
-- or the floating BM moves the call: the guest on the event is swapped and
-- the guest is told.
--
-- Which calendar an event lives on, and who the app acts as when touching
-- it. Null = the legacy arrangement (the BM's own primary calendar, acting
-- as that BM), which every booking before this migration used.
alter table booking.booking
  add column if not exists google_calendar_id text,
  add column if not exists google_actor_email text;

-- The guest message for a change of Booking Manager.
alter table booking.message_template drop constraint if exists message_template_moment_check;
alter table booking.message_template
  add constraint message_template_moment_check
  check (moment in ('confirmation', 'reminder_24h', 'reminder_1h', 'cancellation', 'reschedule', 'followup', 'handover'));
