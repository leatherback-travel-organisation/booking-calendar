-- The Garden: company-wide visibility of Gardening (continuous improvement)
-- projects. Evergreen employee module — every approved Cove employee can view
-- and edit; db/019's invitation transaction grants future invitees User access.

-- 1. Application registration
insert into applications (
  id, slug, name, description, launch_url, owner_name,
  status, risk, allows_employees, allows_external_partners
) values (
  '1dfc88f0-a788-4ef6-891c-3e11013b83ae',
  'garden',
  'The Garden',
  'Company-wide view of Gardening projects — what''s changing, who owns it, and where projects overlap.',
  'https://cove.leatherbacktravel.com/garden',
  'Leadership',
  'active',
  'standard',
  true,
  false
)
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name,
  description = excluded.description, launch_url = excluded.launch_url,
  owner_name = excluded.owner_name, status = excluded.status, risk = excluded.risk,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners,
  updated_at = now();

-- 2. Roles
insert into application_roles (
  id, application_id, role_key, name, access_level,
  allows_employees, allows_external_partners
) values
  ('0a8cb9fd-5fa9-4c56-b3b5-ba8ff2dbc493', '1dfc88f0-a788-4ef6-891c-3e11013b83ae', 'user',  'Garden User',  'user',  true, false),
  ('917c41d9-65dd-47e9-affe-0184f75247a5', '1dfc88f0-a788-4ef6-891c-3e11013b83ae', 'admin', 'Garden Admin', 'admin', true, false)
on conflict (id) do update set
  application_id = excluded.application_id, role_key = excluded.role_key,
  name = excluded.name, access_level = excluded.access_level,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners;

-- 3. Permissions (namespace = slug: "garden")
insert into role_permissions (role_id, permission) values
  ('0a8cb9fd-5fa9-4c56-b3b5-ba8ff2dbc493', 'garden.open'),
  ('0a8cb9fd-5fa9-4c56-b3b5-ba8ff2dbc493', 'garden.read'),
  ('0a8cb9fd-5fa9-4c56-b3b5-ba8ff2dbc493', 'garden.write'),
  ('917c41d9-65dd-47e9-affe-0184f75247a5', 'garden.open'),
  ('917c41d9-65dd-47e9-affe-0184f75247a5', 'garden.read'),
  ('917c41d9-65dd-47e9-affe-0184f75247a5', 'garden.write'),
  ('917c41d9-65dd-47e9-affe-0184f75247a5', 'garden.manage'),
  ('917c41d9-65dd-47e9-affe-0184f75247a5', 'garden.manage_access')
on conflict do nothing;

-- The policy and entitlement inserts below key off an active super_admin as
-- the granting actor; on an environment without one they insert zero rows and
-- nobody gets access. Warn loudly rather than fail — fresh environments only
-- gain a super_admin at runtime, and re-running the grants there is a matter
-- of repeating sections 4-6 once one exists.
do $$
begin
  if not exists (
    select 1 from user_platform_roles
    where role::text = 'super_admin' and revoked_at is null
  ) then
    raise warning 'garden: no active super_admin — access policy and entitlements were NOT granted';
  end if;
end
$$;

-- 4. Evergreen policy: future invitees inherit User access
insert into application_access_policies (application_id, employee_access_policy, configured_by_user_id)
select '1dfc88f0-a788-4ef6-891c-3e11013b83ae', 'all', platform_role.user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin' and platform_role.revoked_at is null
order by platform_role.granted_at limit 1
on conflict (application_id) do update set employee_access_policy = 'all', updated_at = now();

-- 5. Backfill: every currently approved employee gets the User role
insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select
  '1dfc88f0-a788-4ef6-891c-3e11013b83ae',
  '0a8cb9fd-5fa9-4c56-b3b5-ba8ff2dbc493',
  'user', employee.id, grantor.user_id
from users employee
cross join lateral (
  select user_id from user_platform_roles
  where role::text = 'super_admin' and revoked_at is null
  order by granted_at limit 1
) grantor
where is_approved_cove_employee(employee.id)
  and not exists (
    select 1 from entitlements entitlement
    where entitlement.application_id = '1dfc88f0-a788-4ef6-891c-3e11013b83ae'
      and entitlement.user_id = employee.id and entitlement.revoked_at is null
  );

-- 6. Super admins also get the Admin role
insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select distinct on (platform_role.user_id)
  '1dfc88f0-a788-4ef6-891c-3e11013b83ae',
  '917c41d9-65dd-47e9-affe-0184f75247a5',
  'user', platform_role.user_id, platform_role.granted_by_user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin' and platform_role.revoked_at is null
order by platform_role.user_id, platform_role.granted_at;

-- 7. Garden tables. People are directory references, not FK rows: the Airtable
--    people directory stays canonical, so a person is stored as jsonb
--    {"id": "rec…"|null, "name": text, "email": text|null}.
create schema if not exists garden;

create table garden.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  purpose text not null default '' check (char_length(purpose) <= 300),
  owner jsonb not null check (jsonb_typeof(owner) = 'object'),
  sponsor jsonb check (sponsor is null or jsonb_typeof(sponsor) = 'object'),
  teammates jsonb not null default '[]'::jsonb check (jsonb_typeof(teammates) = 'array'),
  growth_stage text not null check (growth_stage in (
    'In Planning', 'Active work', 'Testing or roll out', 'Complete', 'Cancelled or replaced'
  )),
  estimated_completion date,
  teams text[] not null default '{}',
  systems text[] not null default '{}',
  brands text[] not null default '{}',
  quarter_theme text,
  project_link text check (project_link is null or project_link ~ '^https?://'),
  notes text not null default '' check (char_length(notes) <= 1000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 300),
  testing_owners jsonb not null default '[]'::jsonb check (jsonb_typeof(testing_owners) = 'array'),
  testing_teams text[] not null default '{}',
  related_project_ids uuid[] not null default '{}',
  demo_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by jsonb,
  last_edited_at timestamptz not null default now(),
  last_edited_by jsonb,
  stage_changed_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  archived_at timestamptz
);

create index garden_projects_stage_idx on garden.projects (growth_stage) where archived_at is null;

create table garden.overlaps (
  id uuid primary key default gen_random_uuid(),
  project_a uuid not null references garden.projects(id) on delete cascade,
  project_b uuid not null references garden.projects(id) on delete cascade,
  score integer not null,
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  severity text not null check (severity in ('possible', 'material', 'testing')),
  first_detected_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint garden_overlap_pair_order check (project_a < project_b),
  constraint garden_overlap_pair unique (project_a, project_b)
);

create table garden.acknowledgements (
  project_id uuid not null references garden.projects(id) on delete cascade,
  person_key text not null,
  person_name text not null,
  acknowledged_at timestamptz,
  primary key (project_id, person_key)
);
