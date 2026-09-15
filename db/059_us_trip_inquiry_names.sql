-- American English guest touch-points for the US-market brands (Nicola,
-- 1 Sep): the enquiry call type reads "Trip Inquiry" for Carex, Salt
-- Caravan and Harriet. Keys stay stable; only the guest-facing name
-- changes, and a hand-renamed row is left alone.

update booking.event_type et
   set name = 'Trip Inquiry'
  from booking.brand b
 where b.id = et.brand_id
   and b.key in ('carex', 'salt-caravan', 'harriet')
   and et.key = 'enquiry'
   and et.name = 'Trip Enquiry';
