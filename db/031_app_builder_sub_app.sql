-- App Builder is the controlled, employee-facing path for proposing Cove app
-- changes with AI. Processing, preview and publication remain disabled until
-- their approval controls exist.

insert into applications (
  id, slug, name, description, launch_url, owner_name,
  status, risk, allows_employees, allows_external_partners
) values (
  '35fb497e-7236-4f9e-ac2b-11fd55f5e809',
  'app-builder',
  'App Builder',
  'Controlled AI-assisted updates for Cove applications.',
  'https://cove.leatherbacktravel.com/app-builder',
  'Systems & Automation',
  'active',
  'restricted',
  true,
  false
)
on conflict (id) do update set
  slug=excluded.slug, name=excluded.name, description=excluded.description,
  launch_url=excluded.launch_url, owner_name=excluded.owner_name,
  status=excluded.status, risk=excluded.risk,
  allows_employees=excluded.allows_employees,
  allows_external_partners=excluded.allows_external_partners,
  updated_at=now();

insert into application_roles (
  id, application_id, role_key, name, access_level,
  allows_employees, allows_external_partners
) values
  ('43eeed02-938a-487f-b6d3-7085cc41f970', '35fb497e-7236-4f9e-ac2b-11fd55f5e809', 'user', 'App Builder User', 'user', true, false),
  ('c43e704c-4628-4ae4-9848-f95324b03564', '35fb497e-7236-4f9e-ac2b-11fd55f5e809', 'admin', 'App Builder Admin', 'admin', true, false)
on conflict (id) do update set
  application_id=excluded.application_id, role_key=excluded.role_key,
  name=excluded.name, access_level=excluded.access_level,
  allows_employees=excluded.allows_employees,
  allows_external_partners=excluded.allows_external_partners;

insert into role_permissions (role_id, permission) values
  ('43eeed02-938a-487f-b6d3-7085cc41f970', 'app_builder.read'),
  ('c43e704c-4628-4ae4-9848-f95324b03564', 'app_builder.read'),
  ('c43e704c-4628-4ae4-9848-f95324b03564', 'app_builder.approve'),
  ('c43e704c-4628-4ae4-9848-f95324b03564', 'app_builder.configure'),
  ('c43e704c-4628-4ae4-9848-f95324b03564', 'app_builder.manage_access')
on conflict do nothing;

insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select distinct on (platform_role.user_id)
  '35fb497e-7236-4f9e-ac2b-11fd55f5e809',
  'c43e704c-4628-4ae4-9848-f95324b03564',
  'user',
  platform_role.user_id,
  platform_role.granted_by_user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin'
  and platform_role.revoked_at is null
  and not exists (
    select 1 from entitlements entitlement
    where entitlement.application_id = '35fb497e-7236-4f9e-ac2b-11fd55f5e809'
      and entitlement.user_id = platform_role.user_id
      and entitlement.revoked_at is null
  )
order by platform_role.user_id, platform_role.granted_at;
