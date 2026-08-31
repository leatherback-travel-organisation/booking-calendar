-- Launch The Garden (Nicola's go-ahead, 31 Aug 2026). Reverses 054's hold:
-- with the application active again, the evaluator grants every employee's
-- standing entitlement, so the top-nav link, home tile and /garden all appear.

update applications set status = 'active', updated_at = now()
where slug = 'garden' and status = 'maintenance';
