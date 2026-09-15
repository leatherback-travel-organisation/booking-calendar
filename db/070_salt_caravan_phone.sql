-- Salt Caravan's support number. 048 left it null because the site published
-- no number then; saltcaravan.com now shows +1 971 300 4756 on its contact
-- page and sticky call card (Nicola's Salt Caravan site work, 10-11 Sep),
-- and without it the booking confirmation's "save our number" block and the
-- brand's contact card have nothing to show (15 Sep).
update booking.brand set phone_default = '+1 971 300 4756' where key = 'salt-caravan';

insert into booking.audit_log (actor, action, subject, detail)
values ('migration:070', 'brand_phones_set', 'salt-caravan',
        jsonb_build_object('source', 'saltcaravan.com contact page', 'phoneDefault', '+1 971 300 4756'));
