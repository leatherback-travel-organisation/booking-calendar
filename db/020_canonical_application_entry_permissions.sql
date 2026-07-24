-- Standardize the universal Cove entry permission on the existing canonical
-- User/Admin roles. Existing application-specific permissions and entitlements
-- remain unchanged.

insert into role_permissions (role_id, permission)
select
  role.id,
  case
    when replace(application.slug, '-', '_') ~ '^[a-z]'
      then replace(application.slug, '-', '_')
    else 'app_' || replace(application.slug, '-', '_')
  end || '.open'
from application_roles role
join applications application on application.id = role.application_id
where role.role_key in ('user', 'admin')
on conflict do nothing;

insert into role_permissions (role_id, permission)
select
  role.id,
  case
    when replace(application.slug, '-', '_') ~ '^[a-z]'
      then replace(application.slug, '-', '_')
    else 'app_' || replace(application.slug, '-', '_')
  end || '.manage_access'
from application_roles role
join applications application on application.id = role.application_id
where role.role_key = 'admin'
on conflict do nothing;
