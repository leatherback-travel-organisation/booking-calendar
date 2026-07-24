-- "All users" is an Auth-owned, durable access policy. Registration grants
-- every currently approved Cove employee and future invitations receive the
-- same User entitlement inside the invitation transaction.

create table application_access_policies (
  application_id uuid primary key references applications(id) on delete cascade,
  employee_access_policy text not null
    check (employee_access_policy in ('selected', 'all')),
  configured_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index application_access_policies_configured_by_idx
  on application_access_policies (configured_by_user_id);

drop function if exists provision_application_access(
  uuid, text, text, text, text, text, uuid, uuid[]
);

create function provision_application_access(
  p_actor_user_id uuid,
  p_request_id text,
  p_slug text,
  p_name text,
  p_description text,
  p_launch_url text,
  p_owner_user_id uuid,
  p_member_user_ids uuid[],
  p_employee_access_policy text default 'selected'
)
returns table(application_id uuid, application_slug text, duplicate boolean)
language plpgsql
security invoker
volatile
as $$
declare
  v_application_id uuid;
  v_user_role_id uuid;
  v_admin_role_id uuid;
  v_claimed_key text;
  v_existing_action text;
  v_existing_result jsonb;
  v_requested_member_count integer;
  v_valid_member_count integer;
  v_granted_member_count integer;
  v_permission_namespace text;
begin
  if not exists (
    select 1
    from users u
    where u.id = p_actor_user_id
      and u.population = 'employee'
      and u.status = 'active'
      and exists (
        select 1
        from user_platform_roles upr
        where upr.user_id = u.id
          and upr.role::text in ('super_admin', 'systems_admin')
          and upr.revoked_at is null
      )
  ) then
    raise exception 'Your SuperPanel systems access is no longer active.';
  end if;

  insert into mutation_keys (key, actor_user_id, action)
  values (p_request_id, p_actor_user_id, 'application.provisioned')
  on conflict do nothing
  returning key into v_claimed_key;

  if v_claimed_key is null then
    select key.action, key.result
    into v_existing_action, v_existing_result
    from mutation_keys key
    where key.key = p_request_id;

    if v_existing_action is distinct from 'application.provisioned' then
      raise exception 'This registration request ID was already used for another change.';
    end if;
    if nullif(v_existing_result ->> 'application_id', '') is null
      or nullif(v_existing_result ->> 'slug', '') is null then
      raise exception 'The previous application-provisioning result is incomplete.';
    end if;

    return query select
      (v_existing_result ->> 'application_id')::uuid,
      v_existing_result ->> 'slug',
      true;
    return;
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'The application identifier is invalid.';
  end if;
  v_permission_namespace := replace(p_slug, '-', '_');
  if v_permission_namespace !~ '^[a-z]' then
    v_permission_namespace := 'app_' || v_permission_namespace;
  end if;
  if v_permission_namespace !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'The application permission namespace is invalid.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 100 then
    raise exception 'The application name is invalid.';
  end if;
  if p_description is null or length(trim(p_description)) < 5 or length(trim(p_description)) > 500 then
    raise exception 'The application description is invalid.';
  end if;
  if p_launch_url is null or p_launch_url !~ '^https://[^/@:]+(?:[/:?#]|$)' then
    raise exception 'The application launch URL must be credential-free HTTPS.';
  end if;
  if p_employee_access_policy is null
    or p_employee_access_policy not in ('selected', 'all') then
    raise exception 'Choose either selected users or all users.';
  end if;

  if not is_approved_cove_employee(p_owner_user_id) then
    raise exception 'Choose an active or invited Cove employee as product owner.';
  end if;

  if p_employee_access_policy = 'all' then
    select count(*) into v_requested_member_count
    from users u
    where u.id <> p_owner_user_id
      and is_approved_cove_employee(u.id);
    v_valid_member_count := v_requested_member_count;
  else
    select count(*) into v_requested_member_count
    from (
      select distinct member_id
      from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) member_id
      where member_id <> p_owner_user_id
    ) requested;

    select count(*) into v_valid_member_count
    from (
      select distinct u.id
      from users u
      join unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(member_id)
        on requested.member_id = u.id
      where u.id <> p_owner_user_id
        and is_approved_cove_employee(u.id)
    ) valid;
  end if;

  if v_requested_member_count <> v_valid_member_count then
    raise exception 'One or more selected team members are not active or invited Cove employees.';
  end if;

  insert into applications (
    slug, name, description, launch_url, owner_name,
    status, risk, allows_employees, allows_external_partners
  )
  select
    p_slug, trim(p_name), trim(p_description), p_launch_url, u.display_name,
    'active', 'standard', true, false
  from users u
  where u.id = p_owner_user_id
  returning id into v_application_id;

  insert into application_roles (
    application_id, role_key, name, access_level,
    allows_employees, allows_external_partners
  ) values (
    v_application_id, 'user', trim(p_name) || ' User', 'user', true, false
  ) returning id into v_user_role_id;

  insert into application_roles (
    application_id, role_key, name, access_level,
    allows_employees, allows_external_partners
  ) values (
    v_application_id, 'admin', trim(p_name) || ' Admin', 'admin', true, false
  ) returning id into v_admin_role_id;

  insert into role_permissions (role_id, permission) values
    (v_user_role_id, v_permission_namespace || '.open'),
    (v_admin_role_id, v_permission_namespace || '.open'),
    (v_admin_role_id, v_permission_namespace || '.manage_access');

  insert into application_access_policies (
    application_id, employee_access_policy, configured_by_user_id
  ) values (
    v_application_id, p_employee_access_policy, p_actor_user_id
  );

  insert into entitlements (
    application_id, role_id, subject_type, user_id, granted_by_user_id
  ) values (
    v_application_id, v_admin_role_id, 'user', p_owner_user_id, p_actor_user_id
  );

  insert into entitlements (
    application_id, role_id, subject_type, user_id, granted_by_user_id
  )
  select
    v_application_id, v_user_role_id, 'user', member_id, p_actor_user_id
  from (
    select u.id as member_id
    from users u
    where p_employee_access_policy = 'all'
      and u.id <> p_owner_user_id
      and is_approved_cove_employee(u.id)
    union
    select distinct requested.member_id
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(member_id)
    where p_employee_access_policy = 'selected'
      and requested.member_id <> p_owner_user_id
  ) members;

  get diagnostics v_granted_member_count = row_count;

  update mutation_keys
  set result = jsonb_build_object(
    'application_id', v_application_id::text,
    'slug', p_slug,
    'employee_access_policy', p_employee_access_policy
  )
  where key = p_request_id;

  insert into audit_events (
    action, outcome, actor_user_id, application_id,
    target_type, target_id, request_id, metadata
  ) values (
    'application.provisioned', 'success', p_actor_user_id, v_application_id,
    'application', v_application_id::text, p_request_id,
    jsonb_build_object(
      'slug', p_slug,
      'permission_namespace', v_permission_namespace,
      'owner_user_id', p_owner_user_id::text,
      'member_count', v_granted_member_count,
      'employee_access_policy', p_employee_access_policy
    )
  );

  return query select v_application_id, p_slug, false;
end;
$$;

comment on function provision_application_access(
  uuid, text, text, text, text, text, uuid, uuid[], text
)
is 'Auth-owned atomic application provisioning. The all policy grants every approved employee now and automatically applies to future Cove invitations.';
