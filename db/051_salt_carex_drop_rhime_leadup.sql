-- Salt Caravan and Carex do not run RHIME or Lead-Up calls (Nicola, 31 Aug).
--
-- Deactivated, not deleted: existing bookings keep their event type for
-- reminders, manage links and history (those flows look up by id, which
-- ignores active). Guest pages and the book API only offer active types.

update booking.event_type et
   set active = false
  from booking.brand b
 where b.id = et.brand_id
   and b.key in ('salt-caravan', 'carex')
   and et.key in ('rhime', 'lead-up')
   and et.active;

insert into booking.audit_log (actor, action, subject, detail)
select 'migration:051', 'event_type_deactivated', b.key || ':' || et.key,
       jsonb_build_object('reason', 'brand_does_not_run_this_call')
  from booking.event_type et
  join booking.brand b on b.id = et.brand_id
 where b.key in ('salt-caravan', 'carex')
   and et.key in ('rhime', 'lead-up')
   and not et.active;
