-- The brand's PUBLIC inbox, for the contact card guests save (Nicola,
-- 15 Sep: the card showed bookings@, "it should be contact@"). from_email is
-- what the app sends from; the address a guest should write to is the one
-- each brand publishes on its own website — contact@ on every brand's domain
-- (read off each site's contact page, 15 Sep).
alter table booking.brand
  add column if not exists contact_email text;

update booking.brand set contact_email = 'contact@harrietadventures.com'        where key = 'harriet';
update booking.brand set contact_email = 'contact@saltcaravan.com'              where key = 'salt-caravan';
update booking.brand set contact_email = 'contact@carexdesign.com'              where key = 'carex';
update booking.brand set contact_email = 'contact@patchadventures.com.au'       where key = 'patch';
update booking.brand set contact_email = 'contact@caminowomen.com.au'           where key = 'camino-women';
update booking.brand set contact_email = 'contact@fencox.com.au'                where key = 'fencox';
update booking.brand set contact_email = 'contact@magnificentexplorers.com.au'  where key = 'magnificent-explorers';

insert into booking.audit_log (actor, action, subject, detail)
values ('migration:071', 'brand_contact_email_set', 'all',
        jsonb_build_object('source', 'each brand website contact page', 'pattern', 'contact@<brand domain>'));
