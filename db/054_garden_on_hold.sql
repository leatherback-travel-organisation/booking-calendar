-- The Garden is built and seeded but not yet launched (Nicola, 31 Aug 2026).
-- Hold it in maintenance: the evaluator only grants access to active
-- applications, so this one switch hides the nav link, the home tile and
-- /garden itself. Launching later is the reverse update back to 'active'.

update applications set status = 'maintenance', updated_at = now()
where slug = 'garden' and status = 'active';
