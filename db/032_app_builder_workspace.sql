-- Native Cove App Builder workspace. PDF bytes and staged changes stay private
-- in Neon; app visibility is derived from live Admin entitlements.

insert into role_permissions (role_id, permission) values
  ('43eeed02-938a-487f-b6d3-7085cc41f970', 'app_builder.submit'),
  ('c43e704c-4628-4ae4-9848-f95324b03564', 'app_builder.submit')
on conflict do nothing;

insert into application_access_policies (application_id, employee_access_policy, configured_by_user_id)
select '35fb497e-7236-4f9e-ac2b-11fd55f5e809', 'all', platform_role.user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin' and platform_role.revoked_at is null
order by platform_role.granted_at limit 1
on conflict (application_id) do update set employee_access_policy = 'all', updated_at = now();

insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select
  '35fb497e-7236-4f9e-ac2b-11fd55f5e809',
  '43eeed02-938a-487f-b6d3-7085cc41f970',
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
    where entitlement.application_id = '35fb497e-7236-4f9e-ac2b-11fd55f5e809'
      and entitlement.user_id = employee.id and entitlement.revoked_at is null
  );

create table app_builder_requests (
  id uuid primary key default gen_random_uuid(),
  target_asset_id uuid not null references managed_assets(id) on delete restrict,
  target_application_id uuid not null references applications(id) on delete restrict,
  target_slug text not null,
  target_name text not null,
  repository_path text not null,
  production_url text not null,
  requested_by_user_id uuid not null references users(id) on delete restrict,
  requested_by_name text not null,
  filename text not null,
  notes text not null default '',
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (status in (
    'queued', 'reading', 'waiting_openai', 'making_changes',
    'preparing_review', 'needs_approval', 'live', 'failed'
  )),
  status_detail text not null default 'Waiting for this app''s turn',
  openai_response_id text unique,
  agent_turn integer not null default 0 check (agent_turn between 0 and 24),
  staged_changes jsonb not null default '{}'::jsonb,
  branch text unique,
  pull_number integer,
  pull_url text,
  summary text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_builder_request_repository check (repository_path ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  constraint app_builder_request_url check (production_url ~ '^https://'),
  constraint app_builder_request_notes check (char_length(notes) <= 2000),
  constraint app_builder_request_filename check (char_length(filename) between 1 and 180),
  constraint app_builder_request_staged_object check (jsonb_typeof(staged_changes) = 'object')
);

create table app_builder_request_files (
  request_id uuid primary key references app_builder_requests(id) on delete cascade,
  pdf_bytes bytea not null,
  byte_size integer not null check (byte_size between 5 and 26214400),
  created_at timestamptz not null default now()
);

create index app_builder_requests_app_queue_idx
  on app_builder_requests(target_asset_id, status, created_at);
create index app_builder_requests_requester_idx
  on app_builder_requests(requested_by_user_id, created_at desc);
create unique index app_builder_requests_one_active_per_app
  on app_builder_requests(target_asset_id)
  where status in ('reading', 'waiting_openai', 'making_changes', 'preparing_review');
