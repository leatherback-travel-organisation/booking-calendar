-- A Booking Manager's ceiling on calls in one day (Nicola, 8 Sep). Null means
-- no cap, which is the default and exactly how every BM behaves today, so
-- this migration changes nobody's availability until someone sets a number.
--
-- Counted per LOCAL day in the scheduling zone, across every brand and call
-- type: a BM's day is a day, whoever the call is for. Once the day's
-- confirmed calls reach the cap, that day stops offering times.
alter table booking.staff
  add column if not exists daily_call_cap integer
    check (daily_call_cap is null or daily_call_cap between 1 and 20);
