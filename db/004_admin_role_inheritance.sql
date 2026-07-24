-- Application Admin includes the corresponding User capabilities. Keeping the
-- permission rows explicit makes the evaluator deterministic and auditable.
insert into role_permissions (role_id, permission)
select admin_role.id, user_permission.permission
from application_roles admin_role
join application_roles user_role
  on user_role.application_id = admin_role.application_id
 and user_role.access_level = 'user'
join role_permissions user_permission on user_permission.role_id = user_role.id
where admin_role.access_level = 'admin'
on conflict do nothing;
