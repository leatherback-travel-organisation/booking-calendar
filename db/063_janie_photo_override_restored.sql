-- Notion now holds a HIGHER-RESOLUTION copy of the same wide shot (Nicola
-- replaced it 4 Sep), so a circular avatar still crops to sky and jacket
-- rather than her face — a crop applied inside Notion is display-only; the
-- roster sync pulls the underlying file. 062 removed the override on the
-- assumption the framing had changed at source; it had not.
--
-- Re-pointing at the hand-cropped file, now re-cut from the new sharper
-- original. To retire this for good, upload an ALREADY-CROPPED image to the
-- Notion Team Directory and delete this row.

insert into booking.reference_cache (key, payload, fetched_at)
values (
  'staff-photo-override:2608796b-c807-412e-ae8d-29968110d3d6',
  '{"path": "/email/janie-welsh.jpg"}'::jsonb,
  now()
)
on conflict (key) do update
  set payload = excluded.payload, fetched_at = excluded.fetched_at;

update booking.staff
   set photo_url = '/api/booking/staff-photo/2608796b-c807-412e-ae8d-29968110d3d6?v=4',
       updated_at = now()
 where id = '2608796b-c807-412e-ae8d-29968110d3d6'
   and photo_url is not null;
