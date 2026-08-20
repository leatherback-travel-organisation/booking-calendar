-- Group sessions for everyone (Nicola, 20 Aug): every brand's pre-trip
-- call becomes the hour-long group-capable video session, so any BM can
-- run group calls and webinars — no longer Carex-specific.

update booking.event_type
   set supports_group = true,
       duration_min = 60,
       name = 'Pre-Trip Video Call',
       description = 'An hour together on video — pre-trip run-throughs, group Q&As and webinars.',
       location_kind = 'google_meet'
 where key = 'pre-trip';
