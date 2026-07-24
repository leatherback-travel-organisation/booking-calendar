-- Agentic OS is a first-class Cove application. It owns voice delegation,
-- governed agent capabilities, human approvals and rehearsal evidence; Systems
-- retains application telemetry and backup/recovery operations.

insert into applications (
  id, slug, name, description, launch_url, owner_name,
  status, risk, allows_employees, allows_external_partners
) values (
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4',
  'agentic-os',
  'Agentic OS',
  'Voice-first delegation, governed agents and human approval workflows.',
  'https://lbcove.vercel.app/agentic-os',
  'Systems & Automation',
  'active',
  'restricted',
  true,
  false
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  launch_url = excluded.launch_url,
  owner_name = excluded.owner_name,
  status = excluded.status,
  risk = excluded.risk,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners,
  updated_at = now();

insert into application_roles (
  id, application_id, role_key, name, access_level,
  allows_employees, allows_external_partners
) values
  ('789bfb85-141f-47b5-85a2-7cb3e8222269', 'b98aef40-9a08-44f3-8bb9-f840e37e92c4', 'user', 'Agentic OS User', 'user', true, false),
  ('ef16690e-395b-48bd-b8f9-66711af17fc3', 'b98aef40-9a08-44f3-8bb9-f840e37e92c4', 'admin', 'Agentic OS Admin', 'admin', true, false)
on conflict (id) do update set
  application_id = excluded.application_id,
  role_key = excluded.role_key,
  name = excluded.name,
  access_level = excluded.access_level,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners;

insert into role_permissions (role_id, permission) values
  ('789bfb85-141f-47b5-85a2-7cb3e8222269', 'agentic_os.read'),
  ('ef16690e-395b-48bd-b8f9-66711af17fc3', 'agentic_os.read'),
  ('ef16690e-395b-48bd-b8f9-66711af17fc3', 'agentic_os.approve'),
  ('ef16690e-395b-48bd-b8f9-66711af17fc3', 'agentic_os.configure'),
  ('ef16690e-395b-48bd-b8f9-66711af17fc3', 'agentic_os.manage_access')
on conflict do nothing;

insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select distinct on (platform_role.user_id)
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4',
  'ef16690e-395b-48bd-b8f9-66711af17fc3',
  'user',
  platform_role.user_id,
  platform_role.granted_by_user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin'
  and platform_role.revoked_at is null
  and not exists (
    select 1 from entitlements entitlement
    where entitlement.application_id = 'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
      and entitlement.user_id = platform_role.user_id
      and entitlement.revoked_at is null
  )
order by platform_role.user_id, platform_role.granted_at;
