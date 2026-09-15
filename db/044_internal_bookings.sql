-- Internal bookings (Nicola, 26 Aug): a BM (or Pod Lead) books a call for a
-- guest straight from the week calendar — possibly on ANOTHER BM's behalf.
-- The booker and their notes ride on the booking so the BM taking the call
-- has the context; source_kind 'internal' keeps provenance honest instead of
-- masquerading as a guest-made booking.

alter table booking.booking drop constraint if exists booking_source_kind_check;
alter table booking.booking add constraint booking_source_kind_check
  check (source_kind in ('trip', 'bm', 'contact', 'portal', 'invite', 'session', 'internal'));

alter table booking.booking
  add column if not exists booked_by text,
  add column if not exists internal_notes text;
