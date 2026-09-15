-- Nicola replaced Janie's photo in the Notion Team Directory (4 Sep), which
-- is the real fix: the roster sync now pulls a properly framed photo, so the
-- hand-cropped override from 061 is no longer wanted. Dropping it puts her
-- avatar back on the synced source of truth everywhere.
--
-- The override mechanism itself stays in the staff-photo route; it is
-- generic, and any BM whose synced photo crops badly can get a row again.

delete from booking.reference_cache
 where key = 'staff-photo-override:2608796b-c807-412e-ae8d-29968110d3d6';

-- Photos are cached for a day by browsers and the CDN, and the previous
-- pointers (bare and ?v=2) both hold stale copies. A fresh marker makes the
-- new Notion photo appear immediately rather than whenever those expire.
update booking.staff
   set photo_url = '/api/booking/staff-photo/2608796b-c807-412e-ae8d-29968110d3d6?v=3',
       updated_at = now()
 where id = '2608796b-c807-412e-ae8d-29968110d3d6'
   and photo_url is not null;
