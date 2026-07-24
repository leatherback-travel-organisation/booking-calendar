-- Auth-owned transaction primitive for Systems application registration.
-- Systems calls this function inside the same statement that inserts the
-- managed_assets row, so access provisioning cannot be orphaned.

create or replace function provision_application_access(
  p_actor_user_id uuid,
  p_request_id text,
  p_slug text,
  p_name text,
  p_description text,
  p_launch_url text,
  p_owner_user_id uuid,
  p_member_user_ids uuid[]
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
  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 100 then
    raise exception 'The application name is invalid.';
  end if;
  if p_description is null or length(trim(p_description)) < 5 or length(trim(p_description)) > 500 then
    raise exception 'The application description is invalid.';
  end if;
  if p_launch_url is null or p_launch_url !~ '^https://[^/@:]+(?:[/:?#]|$)' then
    raise exception 'The application launch URL must be credential-free HTTPS.';
  end if;

  if not exists (
    select 1
    from users u
    where u.id = p_owner_user_id
      and u.population = 'employee'
      and u.status = 'active'
      and exists (
        select 1
        from identities i
        where i.user_id = u.id
          and i.email_verified_at is not null
      )
  ) then
    raise exception 'Choose an active, verified Cove employee as product owner.';
  end if;

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
      and u.population = 'employee'
      and u.status = 'active'
      and exists (
        select 1
        from identities i
        where i.user_id = u.id
          and i.email_verified_at is not null
      )
  ) valid;

  if v_requested_member_count <> v_valid_member_count then
    raise exception 'One or more selected team members are not active, verified Cove employees.';
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
    (v_user_role_id, p_slug || '.open'),
    (v_admin_role_id, p_slug || '.open'),
    (v_admin_role_id, p_slug || '.manage_access');

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
    select distinct requested.member_id
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(member_id)
    where requested.member_id <> p_owner_user_id
  ) members;

  update mutation_keys
  set result = jsonb_build_object(
    'application_id', v_application_id::text,
    'slug', p_slug
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
      'owner_user_id', p_owner_user_id::text,
      'member_count', v_requested_member_count
    )
  );

  return query select v_application_id, p_slug, false;
end;
$$;

comment on function provision_application_access(uuid, text, text, text, text, text, uuid, uuid[])
is 'Auth-owned, idempotent application/User/Admin provisioning primitive. Call inside the Systems managed_assets insert statement for atomic registration.';
