-- The "online brands" open a Quick Chat by default (Nicola, 14 Sep).
--
-- Salt Caravan's website links already say type=chat, but that rule lived in
-- that site's own repo — so Carex and Avienne would each have to repeat it,
-- and any link already in the wild without a type still opened the 30-minute
-- Trip Inquiry. Putting the default on the brand makes it one row per brand
-- instead of code in three repositories, and it covers links we did not
-- build.
--
-- Null means the old behaviour: prefer "enquiry", else the first guest-facing
-- type. Only brands with a value set change.
alter table booking.brand
  add column if not exists default_event_type_key text;

update booking.brand set default_event_type_key = 'chat' where key in ('salt-caravan', 'carex');
