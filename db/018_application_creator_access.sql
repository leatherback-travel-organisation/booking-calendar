-- Systems operators expect an application they register to appear in their
-- personalised Cove launcher. Preserve entitlement-based visibility by giving
-- the registering operator Admin access instead of bypassing access checks.

with provisioners as (
  select distinct on (event.application_id, event.actor_user_id)
    event.application_id,
    event.actor_user_id
  from audit_events event
  join users actor on actor.id = event.actor_user_id
  where event.action = 'application.provisioned'
    and event.outcome = 'success'
    and event.application_id is not null
    and event.actor_user_id is not null
    and actor.population = 'employee'
    and actor.status = 'active'
  order by event.application_id, event.actor_user_id, event.occurred_at desc
), admin_roles as (
  select role.id, role.application_id
  from application_roles role
  where role.access_level = 'admin'
), granted as (
  insert into entitlements (
    application_id,
    role_id,
    subject_type,
    user_id,
    granted_by_user_id
  )
  select
    provisioner.application_id,
    admin_role.id,
    'user',
    provisioner.actor_user_id,
    provisioner.actor_user_id
  from provisioners provisioner
  join admin_roles admin_role
    on admin_role.application_id = provisioner.application_id
  where not exists (
    select 1
    from entitlements entitlement
    join application_roles entitlement_role
      on entitlement_role.id = entitlement.role_id
    where entitlement.application_id = provisioner.application_id
      and entitlement.user_id = provisioner.actor_user_id
      and entitlement.revoked_at is null
      and (entitlement.starts_at is null or entitlement.starts_at <= now())
      and (entitlement.expires_at is null or entitlement.expires_at > now())
      and entitlement_role.access_level = 'admin'
  )
  returning id, application_id, user_id
)
insert into audit_events (
  action,
  outcome,
  actor_user_id,
  application_id,
  target_type,
  target_id,
  metadata
)
select
  'entitlement.registration_creator_backfilled',
  'success',
  granted.user_id,
  granted.application_id,
  'entitlement',
  granted.id::text,
  jsonb_build_object('level', 'admin', 'reason', 'registered_application')
from granted;
