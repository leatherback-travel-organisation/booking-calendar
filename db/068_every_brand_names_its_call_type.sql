-- Guests never choose a kind of call (Nicola, 14 Sep). The only choice a
-- guest gets is phone or video. Booking Managers pick the right link for
-- their own day-to-day work (?type= on the link always wins); every WEBSITE
-- call opens on the brand's default:
--   online brands    -> 'chat'    (Quick Chat, 15 min)   — salt-caravan, carex (067)
--   adventure brands -> 'enquiry' (Trip Enquiry/Inquiry, 30 min)
-- Naming it on every brand row makes the rule explicit rather than a code
-- fallback, so a new brand is one decision when its row is added.
update booking.brand
   set default_event_type_key = 'enquiry'
 where default_event_type_key is null;
