-- Take The Garden back OFF live Cove (Nicola, 31 Aug evening): the earlier
-- "go-ahead" was a misread — launch must wait for Nicola's explicit ask.
-- Maintenance hides the nav link, home tile and /garden in one switch.

update applications set status = 'maintenance', updated_at = now()
where slug = 'garden' and status = 'active';
