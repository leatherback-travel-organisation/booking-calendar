-- Keep every managed application and its access roles under the Cove name.

update applications
set name = case slug
      when 'supplier-portal' then 'Cove — Supplier Portal'
      when 'dmc-manager' then 'Cove — DMC Manager'
      when 'trtl' then 'Cove — TRTL'
      when 'octomancer' then 'Cove — Octomancer'
      when 'nest' then 'Cove — Nest'
      when 'recruitment' then 'Cove — Recruitment'
      when 'superpanel' then 'Cove — SuperPanel'
    end,
    updated_at = now()
where slug in (
  'supplier-portal',
  'dmc-manager',
  'trtl',
  'octomancer',
  'nest',
  'recruitment',
  'superpanel'
);

update application_roles as role
set name = application.name || case role.role_key
      when 'admin' then ' Admin'
      when 'user' then ' User'
      else ' ' || role.name
    end
from applications as application
where role.application_id = application.id
  and application.slug in (
    'supplier-portal',
    'dmc-manager',
    'trtl',
    'octomancer',
    'nest',
    'recruitment',
    'superpanel'
  );
