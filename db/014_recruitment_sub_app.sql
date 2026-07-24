-- Recruitment is an entitlement-backed internal Cove sub-app. Candidate data
-- remains in the Airtable Candidates/Hiring table; role publishing metadata is
-- stored here so ads and channels are no longer implicit or duplicated.

insert into applications (
  id, slug, name, description, launch_url, owner_name,
  status, risk, allows_employees, allows_external_partners
) values (
  'bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40',
  'recruitment',
  'Recruitment',
  'Internal candidate pipeline and role advertising workspace.',
  'https://lbcove.vercel.app/recruitment',
  'People & Operations',
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
  ('6d311b3b-b266-4adf-8441-5a4f4800e4f0', 'bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40', 'user', 'Recruitment User', 'user', true, false),
  ('77842d6f-c02d-4032-898e-2a1d1253f587', 'bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40', 'admin', 'Recruitment Admin', 'admin', true, false)
on conflict (id) do update set
  application_id = excluded.application_id,
  role_key = excluded.role_key,
  name = excluded.name,
  access_level = excluded.access_level,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners;

insert into role_permissions (role_id, permission) values
  ('6d311b3b-b266-4adf-8441-5a4f4800e4f0', 'recruitment.read'),
  ('6d311b3b-b266-4adf-8441-5a4f4800e4f0', 'recruitment.manage_candidates'),
  ('6d311b3b-b266-4adf-8441-5a4f4800e4f0', 'recruitment.manage_roles'),
  ('77842d6f-c02d-4032-898e-2a1d1253f587', 'recruitment.read'),
  ('77842d6f-c02d-4032-898e-2a1d1253f587', 'recruitment.manage_candidates'),
  ('77842d6f-c02d-4032-898e-2a1d1253f587', 'recruitment.manage_roles'),
  ('77842d6f-c02d-4032-898e-2a1d1253f587', 'recruitment.manage_access')
on conflict do nothing;

insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select distinct on (platform_role.user_id)
  'bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40',
  '77842d6f-c02d-4032-898e-2a1d1253f587',
  'user',
  platform_role.user_id,
  platform_role.granted_by_user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin'
  and platform_role.revoked_at is null
  and not exists (
    select 1 from entitlements entitlement
    where entitlement.application_id = 'bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40'
      and entitlement.user_id = platform_role.user_id
      and entitlement.revoked_at is null
  )
order by platform_role.user_id, platform_role.granted_at;

create table recruitment_roles (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  status text not null default 'draft' check (status in ('draft', 'ready', 'live', 'paused', 'closed')),
  hiring_manager text not null default '',
  location text not null default '',
  employment_type text not null default '',
  ad_copy text not null default '',
  ad_url text check (ad_url is null or ad_url ~ '^https://'),
  advertising_channels text[] not null default '{}',
  publishing_notes text not null default '',
  updated_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recruitment_candidate_comments (
  id uuid primary key default gen_random_uuid(),
  candidate_record_id text not null check (candidate_record_id ~ '^rec[A-Za-z0-9]+$'),
  body text not null check (length(body) between 1 and 5000),
  author_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index recruitment_candidate_comments_record_time
  on recruitment_candidate_comments (candidate_record_id, created_at);
