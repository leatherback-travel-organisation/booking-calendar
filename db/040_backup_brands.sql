-- Backup brand memberships (Nicola, 20 Aug): a BM can back up a brand
-- without it being "their" brand — Janie ↔ Jax back up Carex/Harriet while
-- keeping their own brand identities. Synced from the Notion Team
-- Directory's "Backup Brands" property.

alter table booking.staff_brand
  add column if not exists is_backup boolean not null default false;
