-- Today registry polish (Nicola, 20 Aug): the Cove home tile's subtitle is
-- the application owner_name — same treatment as Calltime's 038.

update applications
   set owner_name = 'Booking Managers - Daily Overview',
       updated_at = now()
 where slug = 'today';
