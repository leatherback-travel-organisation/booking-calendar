-- Cove team membership is allowlist-based, not domain-based. Keep each
-- employee's Workspace domain as identity metadata without restricting it to
-- leatherbacktravel.com.
update users
set workspace_domain = lower(split_part(email, '@', 2)),
    updated_at = now()
where population = 'employee'
  and position('@' in email) > 1
  and split_part(email, '@', 2) <> ''
  and workspace_domain is distinct from lower(split_part(email, '@', 2));
