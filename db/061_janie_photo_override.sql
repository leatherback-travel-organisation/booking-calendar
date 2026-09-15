-- Janie's photo shows mostly sky and jacket at avatar size (Nicola, 4 Sep).
-- Her synced Notion photo is a wide landscape shot; cropped to a circle on
-- the widget, booking pages and manage page it reads as background rather
-- than a face. A hand-cropped head-and-shoulders version ships in the repo
-- (public/email/janie-welsh.jpg, also used by the newsletter card) and this
-- points the staff-photo route at it.
--
-- The override lives in reference_cache, which the roster sync never writes,
-- so editing her Notion row cannot silently restore the old framing. To go
-- back, delete this row; to fix it at source, replace the photo in the
-- Notion Team Directory and delete this row.

insert into booking.reference_cache (key, payload, fetched_at)
values (
  'staff-photo-override:2608796b-c807-412e-ae8d-29968110d3d6',
  '{"path": "/email/janie-welsh.jpg"}'::jsonb,
  now()
)
on conflict (key) do update
  set payload = excluded.payload, fetched_at = excluded.fetched_at;

-- Photos are cached for a day by browsers and the CDN, so the pointer gets a
-- version marker: guests see the new framing now rather than tomorrow.
update booking.staff
   set photo_url = '/api/booking/staff-photo/2608796b-c807-412e-ae8d-29968110d3d6?v=2',
       updated_at = now()
 where id = '2608796b-c807-412e-ae8d-29968110d3d6'
   and photo_url is not null;
