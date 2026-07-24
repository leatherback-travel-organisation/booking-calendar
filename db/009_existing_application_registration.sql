-- Separate systems operations from Auth and Access. Applications remain the
-- authorization source of truth; websites exist only in managed_assets.

alter type platform_role add value if not exists 'systems_admin';

create type managed_asset_kind as enum ('application', 'website');

create table managed_assets (
  id uuid primary key default gen_random_uuid(),
  asset_kind managed_asset_kind not null,
  application_id uuid unique references applications(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  product_owner_user_id uuid references users(id) on delete restrict,
  repository_path text,
  repository_url text,
  production_url text not null check (production_url ~ '^https://'),
  vercel_project_id text,
  risk application_risk not null default 'standard',
  status application_status not null default 'active',
  hygiene_status text not null default 'pending'
    check (hygiene_status in ('pending', 'ready', 'needs_work', 'incomplete_evidence')),
  hygiene_checked_at timestamptz,
  hygiene_evidence jsonb not null default '[]'::jsonb,
  registration_request_id uuid unique,
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (asset_kind = 'application' and application_id is not null)
    or (asset_kind = 'website' and application_id is null)
  ),
  check (
    (repository_path is null and repository_url is null)
    or (repository_path is not null and repository_url is not null)
  ),
  check (repository_path is null or repository_path ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  check (repository_url is null or lower(repository_url) = lower('https://github.com/' || repository_path)),
  check (production_url !~ '^https://[^/]*@'),
  check (jsonb_typeof(hygiene_evidence) = 'array')
);

create unique index managed_assets_repository_path_unique
  on managed_assets (lower(repository_path))
  where repository_path is not null;

create table managed_asset_members (
  asset_id uuid not null references managed_assets(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  added_by_user_id uuid not null references users(id),
  added_at timestamptz not null default now(),
  primary key (asset_id, user_id)
);

-- Preserve the existing application catalogue as systems assets without
-- inventing accountable people. Their first hygiene task is to assign an
-- active, identity-verified product owner.
insert into managed_assets (
  asset_kind,
  application_id,
  slug,
  name,
  description,
  repository_path,
  repository_url,
  production_url,
  risk,
  status,
  created_by_user_id
)
select
  'application',
  application.id,
  application.slug,
  application.name,
  application.description,
  application.repository_path,
  application.repository_url,
  application.launch_url,
  application.risk,
  application.status,
  administrator.user_id
from applications application
cross join lateral (
  select role.user_id
  from user_platform_roles role
  where role.role = 'super_admin' and role.revoked_at is null
  order by role.granted_at
  limit 1
) administrator
on conflict (application_id) do nothing;
