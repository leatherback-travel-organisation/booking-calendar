-- Group sessions live on CallTime Cal too (Nicola, 17 Sep). Same two
-- columns as booking.booking (072): where the event lives and who the app
-- acts as there; null = the BM's own primary, acting as the BM.
alter table booking.group_session
  add column if not exists google_calendar_id text,
  add column if not exists google_actor_email text;
