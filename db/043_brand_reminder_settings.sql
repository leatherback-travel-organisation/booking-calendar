-- Guest reminder settings move from the BM to the brand (Nicola, 21 Aug).
--
-- Reminder emails were a per-BM opt-out that each Booking Manager could flip
-- on their own page; SMS was already a brand setting owned by Pod Leads and
-- Senior BMs in Guest Communications. Guests experience a brand, not a BM, so
-- both now live on the brand and share one permission: Pod Lead or Senior BM.

alter table booking.brand
  add column if not exists reminder_24h_enabled boolean not null default true,
  add column if not exists reminder_1h_enabled  boolean not null default true;

-- Per-BM opt-outs cannot be expressed at brand level, so they are retired
-- rather than silently reinterpreted. Record who had one before the columns
-- go, so the change is auditable and a Pod Lead can follow up per brand.
insert into booking.audit_log (actor, action, subject, detail)
select 'migration:043', 'reminder_scope_moved_to_brand', s.email,
       jsonb_build_object(
         'reminder24hEnabled', s.reminder_24h_enabled,
         'reminder1hEnabled', s.reminder_1h_enabled)
  from booking.staff s
 where s.active
   and (s.reminder_24h_enabled = false or s.reminder_1h_enabled = false);

alter table booking.staff
  drop column if exists reminder_24h_enabled,
  drop column if exists reminder_1h_enabled;
