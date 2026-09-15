-- Guest reminder emails default OFF (Nicola, 31 Aug).
--
-- 043 moved reminder opt-outs from the BM to the brand, which re-enabled
-- reminders for everyone who had opted out. Rather than re-litigate each
-- retired opt-out, the default flips: no brand sends reminder emails until
-- a Pod Lead or Senior BM turns them on in Guest Communications. A brand
-- where a human has already made a deliberate choice since 043 (a
-- brand_reminder_emails audit row from a real actor) keeps that choice.
-- SMS reminders are untouched — they predate 043 and Carex's ON is deliberate.

alter table booking.brand
  alter column reminder_24h_enabled set default false,
  alter column reminder_1h_enabled  set default false;

update booking.brand b
   set reminder_24h_enabled = false,
       reminder_1h_enabled  = false
 where (b.reminder_24h_enabled or b.reminder_1h_enabled)
   and not exists (
         select 1
           from booking.audit_log a
          where a.action = 'brand_reminder_emails'
            and a.subject = b.key
            and a.actor not like 'migration:%');

-- The flip itself is auditable, one row per brand it touched.
insert into booking.audit_log (actor, action, subject, detail)
select 'migration:050', 'reminder_default_off', b.key,
       jsonb_build_object('reminder24hEnabled', false, 'reminder1hEnabled', false)
  from booking.brand b
 where not b.reminder_24h_enabled
   and not b.reminder_1h_enabled
   and not exists (
         select 1
           from booking.audit_log a
          where a.action = 'brand_reminder_emails'
            and a.subject = b.key
            and a.actor not like 'migration:%');
