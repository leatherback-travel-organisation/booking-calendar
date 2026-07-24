-- Money and Injury Reporting are employee services: every currently approved
-- Cove employee receives User access, and db/019 ensures future invitees do too.
-- My Details is a built-in Cove route guarded by requireCoveUser(), so it does
-- not need (and must not invent) a separate application entitlement record.

do $$
declare
  v_target_count integer;
  v_actor_count integer;
begin
  select count(*) into v_target_count
  from applications application
  where application.slug in ('money', 'injuries')
    and exists (
      select 1
      from application_roles role
      where role.application_id = application.id
        and role.role_key = 'user'
        and role.access_level = 'user'
        and role.allows_employees = true
    );

  if v_target_count <> 2 then
    raise exception 'Money and Injury Reporting must both have canonical employee User roles before enabling Evergreen access.';
  end if;

  select count(*) into v_actor_count
  from users employee
  where employee.population = 'employee'
    and employee.status = 'active'
    and exists (
      select 1
      from user_platform_roles platform_role
      where platform_role.user_id = employee.id
        and platform_role.role = 'super_admin'
        and platform_role.revoked_at is null
    );

  if v_actor_count < 1 then
    raise exception 'An active Cove super administrator is required to enable Evergreen access.';
  end if;
end
$$;

with evergreen_lock as (
  select pg_advisory_xact_lock(hashtext('cove-evergreen-application-access'))
), actor as (
  select employee.id
  from users employee
  where employee.population = 'employee'
    and employee.status = 'active'
    and exists (
      select 1
      from user_platform_roles platform_role
      where platform_role.user_id = employee.id
        and platform_role.role = 'super_admin'
        and platform_role.revoked_at is null
    )
  order by employee.created_at, employee.id
  limit 1
), request as (
  select gen_random_uuid()::text as id
), targets as (
  select application.id
  from applications application
  where application.slug in ('money', 'injuries')
), policies as (
  insert into application_access_policies (
    application_id, employee_access_policy, configured_by_user_id
  )
  select target.id, 'all', actor.id
  from targets target
  cross join actor
  cross join evergreen_lock
  on conflict (application_id) do update
    set employee_access_policy = excluded.employee_access_policy,
        configured_by_user_id = excluded.configured_by_user_id,
        updated_at = now()
  returning application_id
), grants as (
  insert into entitlements (
    application_id, role_id, subject_type, user_id, granted_by_user_id
  )
  select
    policy.application_id, role.id, 'user', employee.id, actor.id
  from policies policy
  cross join actor
  join application_roles role
    on role.application_id = policy.application_id
   and role.role_key = 'user'
   and role.access_level = 'user'
   and role.allows_employees = true
  join users employee
    on is_approved_cove_employee(employee.id)
  where not exists (
    select 1
    from entitlements entitlement
    where entitlement.application_id = policy.application_id
      and entitlement.user_id = employee.id
      and entitlement.revoked_at is null
      and (entitlement.starts_at is null or entitlement.starts_at <= now())
      and (entitlement.expires_at is null or entitlement.expires_at > now())
  )
  returning id, application_id, user_id
), grant_audits as (
  insert into audit_events (
    action, outcome, actor_user_id, application_id,
    target_type, target_id, request_id, metadata
  )
  select
    'entitlement.evergreen_access_granted', 'success', actor.id,
    grant_result.application_id, 'entitlement', grant_result.id::text,
    request.id,
    jsonb_build_object(
      'user_id', grant_result.user_id::text,
      'level', 'user',
      'policy', 'all',
      'source', 'employee_service_migration'
    )
  from grants grant_result
  cross join actor
  cross join request
), policy_audits as (
  insert into audit_events (
    action, outcome, actor_user_id, application_id,
    target_type, target_id, request_id, metadata
  )
  select
    'application.employee_access_policy_changed', 'success', actor.id,
    policy.application_id, 'application', policy.application_id::text,
    request.id,
    jsonb_build_object('employee_access_policy', 'all', 'source', 'employee_service_migration')
  from policies policy
  cross join actor
  cross join request
)
select
  (select count(*) from policies) as evergreen_applications,
  (select count(*) from grants) as employee_entitlements_granted;
