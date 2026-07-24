-- Cove / SuperPanel access-control schema for PostgreSQL 15+.
-- Apply with a migration owner; the application runtime role should not own tables.

create extension if not exists pgcrypto;

create type identity_population as enum ('employee', 'external_partner');
create type user_status as enum ('active', 'suspended', 'deprovisioned');
create type application_status as enum ('active', 'maintenance', 'retired');
create type application_risk as enum ('standard', 'sensitive', 'restricted');
create type application_access_level as enum ('user', 'admin');
create type entitlement_subject_type as enum ('user', 'team');
create type platform_role as enum (
  'super_admin',
  'access_admin',
  'application_admin',
  'finance_admin',
  'people_admin',
  'auditor'
);
create type audit_outcome as enum ('success', 'denied', 'error');

create table partner_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  population identity_population not null,
  email text not null,
  display_name text not null,
  status user_status not null default 'active',
  workspace_domain text,
  partner_organisation_id uuid references partner_organisations(id),
  session_version bigint not null default 1 check (session_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email)),
  check (
    (population = 'employee' and workspace_domain is not null and partner_organisation_id is null)
    or
    (population = 'external_partner' and workspace_domain is null and partner_organisation_id is not null)
  )
);

create unique index users_email_unique on users (lower(email));

-- Provider subjects are immutable identifiers. Emails are deliberately not keys.
create table identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  issuer text not null,
  subject text not null,
  email_verified_at timestamptz,
  last_authenticated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (issuer, subject)
);

-- Access is approved before Google authentication. A pending invitation is
-- the allowlist record; first sign-in verifies the same email and binds the
-- immutable provider subject to the accepted user in one transaction.
create table user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id uuid not null references users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references users(id),
  check (email = lower(email)),
  check (expires_at is null or expires_at > invited_at),
  check (
    (status = 'accepted' and accepted_at is not null and accepted_user_id is not null)
    or
    (status <> 'accepted' and accepted_at is null and accepted_user_id is null)
  )
);

create unique index one_pending_invitation_per_email
  on user_invitations (lower(email))
  where status = 'pending';

create table user_platform_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role platform_role not null,
  granted_by_user_id uuid not null references users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index one_live_platform_role
  on user_platform_roles (user_id, role)
  where revoked_at is null;

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  starts_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  granted_by_user_id uuid not null references users(id),
  granted_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create unique index one_live_team_membership
  on team_memberships (team_id, user_id)
  where revoked_at is null;

create table applications (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  launch_url text not null check (launch_url ~ '^https://'),
  owner_name text not null,
  repository_path text,
  repository_url text check (repository_url is null or repository_url ~ '^https://'),
  status application_status not null default 'active',
  risk application_risk not null default 'standard',
  allows_employees boolean not null default true,
  allows_external_partners boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (allows_employees or allows_external_partners)
);

create table application_roles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  role_key text not null check (role_key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  access_level application_access_level not null,
  allows_employees boolean not null default true,
  allows_external_partners boolean not null default false,
  created_at timestamptz not null default now(),
  check (allows_employees or allows_external_partners),
  unique (application_id, role_key),
  unique (id, application_id)
);

create table role_permissions (
  role_id uuid not null references application_roles(id) on delete cascade,
  permission text not null check (permission ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  primary key (role_id, permission)
);

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  role_id uuid not null,
  subject_type entitlement_subject_type not null,
  user_id uuid references users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  all_partner_organisations boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  granted_by_user_id uuid not null references users(id),
  granted_at timestamptz not null default now(),
  foreign key (role_id, application_id)
    references application_roles(id, application_id),
  check (
    (subject_type = 'user' and user_id is not null and team_id is null)
    or
    (subject_type = 'team' and team_id is not null and user_id is null)
  ),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  check ((revoked_at is null and revoked_reason is null) or revoked_at is not null)
);

create index entitlements_user_lookup
  on entitlements (application_id, user_id)
  where revoked_at is null;

create index entitlements_team_lookup
  on entitlements (application_id, team_id)
  where revoked_at is null;

-- External-partner grants must name at least one organisation. The service layer
-- additionally rejects all_partner_organisations for every external identity.
create table entitlement_partner_organisation_scopes (
  entitlement_id uuid not null references entitlements(id) on delete cascade,
  partner_organisation_id uuid not null references partner_organisations(id) on delete cascade,
  primary key (entitlement_id, partner_organisation_id)
);

-- Append-only security and administration record. Metadata must be pre-redacted.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  action text not null check (action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  outcome audit_outcome not null,
  actor_user_id uuid references users(id) on delete set null,
  actor_identity_subject text,
  application_id uuid references applications(id) on delete set null,
  target_type text check (target_type in ('user', 'team', 'application', 'entitlement', 'session')),
  target_id text,
  request_id text,
  ip_address_hash text,
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(metadata) = 'object'),
  check ((target_type is null and target_id is null) or (target_type is not null and target_id is not null))
);

create index audit_events_occurred_at_desc on audit_events (occurred_at desc);
create index audit_events_actor_lookup on audit_events (actor_user_id, occurred_at desc);
create index audit_events_application_lookup on audit_events (application_id, occurred_at desc);

create function reject_audit_event_change() returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events are append-only';
end;
$$;

create trigger audit_events_no_update
before update or delete on audit_events
for each row execute function reject_audit_event_change();
