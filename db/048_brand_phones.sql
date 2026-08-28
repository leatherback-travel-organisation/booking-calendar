-- Support phone numbers, taken from each brand's own published website
-- contact details (28 Aug). {{brand.phone}} and the guest page "Call us"
-- link rendered empty everywhere because no brand ever had a number stored.
-- Salt Caravan publishes no phone number; it stays null on purpose.

update booking.brand set phone_au = '+61 482 099 562', phone_default = '+61 482 099 562' where key = 'patch';
update booking.brand set phone_au = '+61 482 073 107', phone_nz = '+64 9 802 2918', phone_default = '+61 482 073 107' where key = 'camino-women';
update booking.brand set phone_au = '+61 482 095 648', phone_default = '+61 482 095 648' where key = 'magnificent-explorers';
update booking.brand set phone_au = '+61 483 947 278', phone_nz = '+64 9 801 3252', phone_default = '+61 483 947 278' where key = 'fencox';
update booking.brand set phone_default = '+1 240 247 3466' where key = 'carex';
update booking.brand set phone_default = '+1 971 258 0516' where key = 'harriet';

insert into booking.audit_log (actor, action, subject, detail)
values ('migration:048', 'brand_phones_set', 'all',
        jsonb_build_object('source', 'brand website tel: links', 'saltCaravan', 'none published'));
