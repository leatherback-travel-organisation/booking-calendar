-- "RHIME" is an internal acronym (Nicola, 26 Aug) — guests see plain
-- language. The event type's stored name stays "RHIME Call" for BM pages;
-- code maps it to "Trip Planning Call" on every guest surface. What code
-- cannot map is the seeded email template PROSE, which says "RHIME call"
-- to guests in subjects and bodies — rewrite those in place. Hand-edited
-- templates are included on purpose: the acronym should not reach guests
-- from anywhere.

update booking.message_template
   set subject   = replace(replace(subject,  'RHIME Call', 'Booking Call'), 'RHIME call', 'booking call'),
       body_html = replace(replace(body_html,'RHIME Call', 'Booking Call'), 'RHIME call', 'booking call')
 where subject like '%RHIME%' or body_html like '%RHIME%';

insert into booking.audit_log (actor, action, subject, detail)
values ('migration:045', 'templates_deacronymed', 'rhime',
        jsonb_build_object('note', 'RHIME wording replaced with guest language in message templates'));
