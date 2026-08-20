-- Calltime registry polish (Nicola, 20 Aug): the Cove home tile's subtitle
-- is the application owner_name; and Janie is the decided video exception
-- (all other BMs are phone-only by default).

update applications
   set owner_name = 'Booking Managers - Call Scheduler',
       updated_at = now()
 where id = '7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01';

update booking.staff
   set video_calls_enabled = true
 where email = 'janie@leatherbacktravel.com';
