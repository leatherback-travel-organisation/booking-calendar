-- Repair application registrations whose Auth record committed before the
-- Systems managed-asset insert returned a row. This is intentionally generic,
-- idempotent and limited to completed application.provisioned mutations.

with candidates as (
  select
    application.id as application_id,
    application.slug,
    application.name,
    application.description,
    application.launch_url,
    application.repository_path,
    application.repository_url,
    application.risk,
    mutation.actor_user_id,
    mutation.key::uuid as registration_request_id,
    owner.user_id as product_owner_user_id
  from mutation_keys mutation
  join applications application
    on application.id::text = mutation.result ->> 'application_id'
  cross join lateral (
    select entitlement.user_id
    from entitlements entitlement
    join application_roles role
      on role.id = entitlement.role_id
     and role.application_id = application.id
     and role.access_level = 'admin'
    join users owner_user
      on owner_user.id = entitlement.user_id
     and owner_user.display_name = application.owner_name
    where entitlement.application_id = application.id
      and entitlement.subject_type = 'user'
      and entitlement.revoked_at is null
      and (entitlement.starts_at is null or entitlement.starts_at <= now())
      and (entitlement.expires_at is null or entitlement.expires_at > now())
    order by entitlement.granted_at, entitlement.id
    limit 1
  ) owner
  where mutation.action = 'application.provisioned'
    and mutation.actor_user_id is not null
    and mutation.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and not exists (
      select 1 from managed_assets asset
      where asset.application_id = application.id
    )
), created_assets as (
  insert into managed_assets (
    asset_kind, application_id, slug, name, description,
    product_owner_user_id, repository_path, repository_url,
    production_url, risk, status, registration_request_id,
    created_by_user_id
  )
  select
    'application', candidate.application_id, candidate.slug,
    candidate.name, candidate.description,
    candidate.product_owner_user_id, candidate.repository_path,
    candidate.repository_url, candidate.launch_url,
    candidate.risk, 'maintenance', candidate.registration_request_id,
    candidate.actor_user_id
  from candidates candidate
  on conflict (application_id) do nothing
  returning id, application_id, product_owner_user_id,
            registration_request_id, created_by_user_id
), synced_applications as (
  update applications application
  set status = 'maintenance', updated_at = now()
  from created_assets asset
  where application.id = asset.application_id
  returning application.id
), created_members as (
  insert into managed_asset_members (asset_id, user_id, added_by_user_id)
  select asset.id, entitlement.user_id, asset.created_by_user_id
  from created_assets asset
  join entitlements entitlement
    on entitlement.application_id = asset.application_id
   and entitlement.subject_type = 'user'
   and entitlement.user_id <> asset.product_owner_user_id
   and entitlement.revoked_at is null
   and (entitlement.starts_at is null or entitlement.starts_at <= now())
   and (entitlement.expires_at is null or entitlement.expires_at > now())
  join application_roles role
    on role.id = entitlement.role_id
   and role.access_level = 'user'
  on conflict (asset_id, user_id) do nothing
  returning asset_id, user_id
), audited as (
  insert into audit_events (
    action, outcome, actor_user_id, application_id,
    target_type, target_id, request_id, metadata
  )
  select
    'systems.asset_registration_repaired', 'success',
    asset.created_by_user_id, asset.application_id,
    'application', asset.application_id::text,
    asset.registration_request_id::text,
    jsonb_build_object('repair', 'missing_managed_asset')
  from created_assets asset
)
select count(*) as repaired_application_registrations from created_assets;
