-- Durable Cove SSO integration workflow for registered application assets.
-- Canonical application entitlements remain in Auth & Access; this schema only
-- records provider orchestration, real evidence and the approval audit trail.

create type cove_sso_integration_state as enum (
  'not_configured',
  'changes_prepared',
  'checks_running',
  'needs_attention',
  'ready_for_approval',
  'active'
);

create type cove_sso_environment_status as enum (
  'not_configured',
  'setup_required',
  'queued',
  'configured',
  'verified'
);

create type cove_sso_evidence_status as enum (
  'pending',
  'running',
  'passed',
  'failed',
  'unavailable'
);

-- The pair is already unique in practice because id is the primary key. The
-- explicit index lets the integration foreign key prove that the managed asset
-- and canonical Auth application belong to the same row.
create unique index managed_assets_id_application_id_unique
  on managed_assets (id, application_id);

create table cove_sso_integrations (
  id uuid primary key default gen_random_uuid(),
  managed_asset_id uuid not null unique,
  application_id uuid not null unique,
  state cove_sso_integration_state not null default 'not_configured',
  version bigint not null default 1 check (version > 0),
  kit_package text not null default '@leatherback/cove-auth'
    check (kit_package = '@leatherback/cove-auth'),
  kit_version text check (
    kit_version is null
    or kit_version ~ '^v?[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$'
  ),
  hostname text check (
    hostname is null
    or (
      hostname = lower(hostname)
      and hostname ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
      and length(hostname) <= 253
    )
  ),
  clerk_instance_id text check (clerk_instance_id is null or length(trim(clerk_instance_id)) > 0),
  clerk_satellite_domain_id text check (clerk_satellite_domain_id is null or length(trim(clerk_satellite_domain_id)) > 0),
  github_repository_id text check (github_repository_id is null or length(trim(github_repository_id)) > 0),
  vercel_project_id text check (vercel_project_id is null or length(trim(vercel_project_id)) > 0),
  github_branch text check (
    github_branch is null
    or (
      length(github_branch) between 1 and 255
      and github_branch !~ '[[:space:]~^:?*]'
      and position('[' in github_branch) = 0
      and position(chr(92) in github_branch) = 0
      and position('..' in github_branch) = 0
      and github_branch !~ '(^|/)\.'
      and github_branch !~ '[./]$'
    )
  ),
  github_pull_request_number bigint check (github_pull_request_number is null or github_pull_request_number > 0),
  github_pull_request_url text check (
    github_pull_request_url is null
    or (
      github_pull_request_url ~ '^https://github\.com/'
      and github_pull_request_url !~ '^https://[^/]*@'
    )
  ),
  github_commit_sha text check (github_commit_sha is null or github_commit_sha ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  environment_status cove_sso_environment_status not null default 'not_configured',
  approved_by_user_id uuid references users(id) on delete restrict,
  approved_at timestamptz,
  approval_note text,
  github_merged_at timestamptz,
  deployed_at timestamptz,
  activated_at timestamptz,
  last_action text check (last_action is null or last_action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  last_error text,
  last_error_at timestamptz,
  last_request_id text,
  created_by_user_id uuid not null references users(id) on delete restrict,
  updated_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (managed_asset_id, application_id)
    references managed_assets(id, application_id) on delete restrict,
  check (
    (approved_by_user_id is null and approved_at is null)
    or (approved_by_user_id is not null and approved_at is not null)
  ),
  check (
    (last_error is null and last_error_at is null)
    or (last_error is not null and last_error_at is not null)
  ),
  check (github_merged_at is null or approved_at is not null),
  check (deployed_at is null or approved_at is not null),
  check (activated_at is null or deployed_at is not null),
  constraint cove_sso_active_metadata_required check (
    state <> 'active'
    or (
      kit_version is not null
      and hostname is not null
      and clerk_instance_id is not null
      and clerk_satellite_domain_id is not null
      and github_repository_id is not null
      and vercel_project_id is not null
      and github_branch is not null
      and github_pull_request_number is not null
      and github_pull_request_url is not null
      and github_commit_sha is not null
      and environment_status = 'verified'
      and approved_by_user_id is not null
      and approved_at is not null
      and github_merged_at is not null
      and deployed_at is not null
      and activated_at is not null
      and last_error is null
      and approved_at <= github_merged_at
      and approved_at <= deployed_at
      and github_merged_at <= deployed_at
      and deployed_at <= activated_at
    )
  )
);

create index cove_sso_integrations_state_updated_lookup
  on cove_sso_integrations (state, updated_at desc);

create table cove_sso_evidence (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references cove_sso_integrations(id) on delete cascade,
  check_key text not null check (check_key ~ '^[a-z][a-z0-9_]*$'),
  is_required boolean not null,
  status cove_sso_evidence_status not null default 'pending',
  source text not null check (length(trim(source)) between 1 and 200),
  summary text not null default '',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  collected_at timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, check_key),
  check (
    is_required = (check_key in (
      'canonical_application',
      'canonical_user_role',
      'canonical_admin_role',
      'clerk_satellite_domain',
      'github_change_set',
      'vercel_environment',
      'build',
      'automated_tests',
      'authentication_hygiene',
      'production_deployment',
      'production_authentication'
    ))
  ),
  check (
    status in ('pending', 'running')
    or collected_at is not null
  ),
  check (valid_until is null or (collected_at is not null and valid_until > collected_at))
);

create index cove_sso_evidence_integration_status_lookup
  on cove_sso_evidence (integration_id, status);

create table cove_sso_workflow_events (
  id bigint generated always as identity primary key,
  integration_id uuid not null references cove_sso_integrations(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  outcome audit_outcome not null,
  source text not null check (length(trim(source)) between 1 and 200),
  actor_user_id uuid references users(id) on delete restrict,
  from_state cove_sso_integration_state,
  to_state cove_sso_integration_state,
  request_id text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  check (
    (from_state is null and to_state is null)
    or to_state is not null
  )
);

create index cove_sso_workflow_events_integration_history
  on cove_sso_workflow_events (integration_id, occurred_at desc, id desc);

create function prepare_cove_sso_integration_update() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.state is distinct from old.state and not (
    (old.state = 'not_configured' and new.state in ('changes_prepared', 'needs_attention'))
    or (old.state = 'changes_prepared' and new.state in ('not_configured', 'checks_running', 'needs_attention'))
    or (old.state = 'checks_running' and new.state in ('changes_prepared', 'needs_attention', 'ready_for_approval'))
    or (old.state = 'needs_attention' and new.state in ('changes_prepared', 'checks_running', 'ready_for_approval'))
    or (old.state = 'ready_for_approval' and new.state in ('changes_prepared', 'checks_running', 'needs_attention', 'active'))
    or (old.state = 'active' and new.state = 'needs_attention')
  ) then
    raise exception 'The Cove SSO workflow cannot move from % to %.', old.state, new.state;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger cove_sso_integrations_prepare_update
before update on cove_sso_integrations
for each row execute function prepare_cove_sso_integration_update();

create function prepare_cove_sso_evidence_update() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cove_sso_evidence_prepare_update
before update on cove_sso_evidence
for each row execute function prepare_cove_sso_evidence_update();

create function seed_cove_sso_required_evidence() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.cove_sso_evidence (
    integration_id,
    check_key,
    is_required,
    source,
    summary
  )
  select
    new.id,
    required_check.check_key,
    true,
    'superpanel.workflow',
    'Waiting for real evidence.'
  from unnest(array[
    'canonical_application',
    'canonical_user_role',
    'canonical_admin_role',
    'clerk_satellite_domain',
    'github_change_set',
    'vercel_environment',
    'build',
    'automated_tests',
    'authentication_hygiene',
    'production_deployment',
    'production_authentication'
  ]::text[]) required_check(check_key);

  return null;
end;
$$;

create trigger cove_sso_integrations_seed_evidence
after insert on cove_sso_integrations
for each row execute function seed_cove_sso_required_evidence();

create function assert_cove_sso_activation(p_integration_id uuid) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_integration cove_sso_integrations%rowtype;
  v_missing_checks text[];
begin
  select integration.*
  into v_integration
  from public.cove_sso_integrations integration
  where integration.id = p_integration_id;

  if not found or v_integration.state <> 'active' then
    return;
  end if;

  if not exists (
    select 1
    from public.users approver
    where approver.id = v_integration.approved_by_user_id
      and approver.population = 'employee'
      and approver.status = 'active'
      and exists (
        select 1
        from public.user_platform_roles platform_role
        where platform_role.user_id = approver.id
          and platform_role.role::text in ('super_admin', 'systems_admin')
          and platform_role.revoked_at is null
      )
  ) then
    raise exception 'Active Cove SSO requires approval from a current Systems administrator.';
  end if;

  select array_agg(required_check.check_key order by required_check.check_key)
  into v_missing_checks
  from unnest(array[
    'canonical_application',
    'canonical_user_role',
    'canonical_admin_role',
    'clerk_satellite_domain',
    'github_change_set',
    'vercel_environment',
    'build',
    'automated_tests',
    'authentication_hygiene',
    'production_deployment',
    'production_authentication'
  ]::text[]) required_check(check_key)
  where not exists (
    select 1
    from public.cove_sso_evidence evidence
    where evidence.integration_id = p_integration_id
      and evidence.check_key = required_check.check_key
      and evidence.is_required
      and evidence.status = 'passed'
      and evidence.collected_at is not null
      and evidence.collected_at <= now()
      and (evidence.valid_until is null or evidence.valid_until > now())
  );

  if cardinality(v_missing_checks) > 0 then
    raise exception 'Active Cove SSO is missing current passing evidence: %.', array_to_string(v_missing_checks, ', ');
  end if;

  if not exists (
    select 1
    from public.cove_sso_evidence evidence
    where evidence.integration_id = p_integration_id
      and evidence.check_key = 'production_deployment'
      and evidence.collected_at >= v_integration.approved_at
  ) or not exists (
    select 1
    from public.cove_sso_evidence evidence
    where evidence.integration_id = p_integration_id
      and evidence.check_key = 'production_authentication'
      and evidence.collected_at >= v_integration.deployed_at
  ) then
    raise exception 'Production deployment and authentication evidence must be collected after approval and deployment.';
  end if;
end;
$$;

create function enforce_cove_sso_integration_activation() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_cove_sso_activation(new.id);
  return null;
end;
$$;

create constraint trigger cove_sso_integrations_activation_gate
after insert or update on cove_sso_integrations
deferrable initially immediate
for each row execute function enforce_cove_sso_integration_activation();

create function enforce_cove_sso_evidence_activation() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_integration_id uuid;
begin
  if tg_op = 'DELETE' then
    v_integration_id := old.integration_id;
  else
    v_integration_id := new.integration_id;
  end if;
  perform public.assert_cove_sso_activation(v_integration_id);
  return null;
end;
$$;

create constraint trigger cove_sso_evidence_activation_gate
after insert or update or delete on cove_sso_evidence
deferrable initially immediate
for each row execute function enforce_cove_sso_evidence_activation();

create function record_cove_sso_state_event() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.cove_sso_workflow_events (
      integration_id, event_type, outcome, source, actor_user_id,
      to_state, request_id, details
    ) values (
      new.id, 'cove_sso.integration_created', 'success', 'superpanel', new.created_by_user_id,
      new.state, new.last_request_id, jsonb_build_object('version', new.version)
    );
  elsif new.state is distinct from old.state then
    insert into public.cove_sso_workflow_events (
      integration_id, event_type, outcome, source, actor_user_id,
      from_state, to_state, request_id, details
    ) values (
      new.id,
      'cove_sso.state_changed',
      case when new.state = 'needs_attention' then 'error'::audit_outcome else 'success'::audit_outcome end,
      'superpanel',
      new.updated_by_user_id,
      old.state,
      new.state,
      new.last_request_id,
      jsonb_build_object('version', new.version, 'last_action', new.last_action)
    );
  end if;
  return null;
end;
$$;

create trigger cove_sso_integrations_record_state_event
after insert or update of state on cove_sso_integrations
for each row execute function record_cove_sso_state_event();

create function reject_cove_sso_workflow_event_change() returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Cove SSO workflow events are append-only.';
end;
$$;

create trigger cove_sso_workflow_events_no_update
before update or delete on cove_sso_workflow_events
for each row execute function reject_cove_sso_workflow_event_change();

-- These records are server-administered and intentionally have no browser RLS
-- policies. The application database role uses the trusted server connection.
alter table cove_sso_integrations enable row level security;
alter table cove_sso_evidence enable row level security;
alter table cove_sso_workflow_events enable row level security;

revoke all on table cove_sso_integrations from public;
revoke all on table cove_sso_evidence from public;
revoke all on table cove_sso_workflow_events from public;
revoke all on function assert_cove_sso_activation(uuid) from public;

comment on table cove_sso_integrations is
  'One server-administered Cove SSO workflow per canonical application managed asset.';
comment on table cove_sso_evidence is
  'Normalized provider, build, test and production evidence. Passing status must come from the named real source.';
comment on table cove_sso_workflow_events is
  'Append-only Cove SSO orchestration and approval history. Details must be redacted before insertion.';
