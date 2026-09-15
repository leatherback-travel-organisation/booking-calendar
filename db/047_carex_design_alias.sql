-- The company Brands base names Carex "Carex Design Tours" (Nicola's
-- brand-identity sync surfaced the mismatch, 26 Aug). Aliases exist for
-- exactly this; add it so the identity sync can match the record.

update booking.brand
   set aliases = array_append(aliases, 'Carex Design Tours')
 where key = 'carex'
   and not ('Carex Design Tours' = any(aliases));
