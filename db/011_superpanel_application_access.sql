-- SuperPanel is a genuine Cove Sub-App. Its Apps workspace card is backed by
-- an ordinary application entitlement, while /systems independently rechecks
-- the Systems platform role at every server boundary.

do $$
begin
  if exists (
    select 1 from applications
    where slug = 'superpanel'
      and id <> '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'::uuid
  ) then
    raise exception 'The SuperPanel application slug is already bound to a different identifier.';
  end if;
end;
$$;

insert into applications (
  id, slug, name, description, launch_url, owner_name,
  status, risk, allows_employees, allows_external_partners
) values (
  '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
  'superpanel',
  'SuperPanel',
  'Systems administration for Leatherback Travel applications and websites.',
  'https://lbcove.vercel.app/systems',
  'Leatherback Travel Systems',
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
  (
    '59e25954-bfc8-4ceb-a55d-c8b0b50c7b6a',
    '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
    'user', 'SuperPanel User', 'user', true, false
  ),
  (
    '0ab6228f-acde-44df-aef3-9475d30f72e1',
    '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
    'admin', 'SuperPanel Admin', 'admin', true, false
  )
on conflict (id) do update set
  application_id = excluded.application_id,
  role_key = excluded.role_key,
  name = excluded.name,
  access_level = excluded.access_level,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners;

insert into role_permissions (role_id, permission) values
  ('59e25954-bfc8-4ceb-a55d-c8b0b50c7b6a', 'superpanel.open'),
  ('0ab6228f-acde-44df-aef3-9475d30f72e1', 'superpanel.open'),
  ('0ab6228f-acde-44df-aef3-9475d30f72e1', 'superpanel.manage_access')
on conflict do nothing;

-- Backfill one live Admin entitlement for every current Systems operator.
insert into entitlements (
  application_id, role_id, subject_type, user_id, granted_by_user_id
)
select distinct on (platform_role.user_id)
  '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
  '0ab6228f-acde-44df-aef3-9475d30f72e1',
  'user',
  platform_role.user_id,
  platform_role.granted_by_user_id
from user_platform_roles platform_role
where platform_role.role::text in ('super_admin', 'systems_admin')
  and platform_role.revoked_at is null
  and not exists (
    select 1
    from entitlements entitlement
    where entitlement.application_id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'
      and entitlement.user_id = platform_role.user_id
      and entitlement.role_id = '0ab6228f-acde-44df-aef3-9475d30f72e1'
      and entitlement.revoked_at is null
  )
order by platform_role.user_id, platform_role.granted_at;

create or replace function enforce_superpanel_entitlement_source()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.application_id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'::uuid
    and new.revoked_at is null
    and (
      new.subject_type <> 'user'
      or new.user_id is null
      or new.role_id <> '0ab6228f-acde-44df-aef3-9475d30f72e1'::uuid
      or not exists (
        select 1
        from user_platform_roles platform_role
        where platform_role.user_id = new.user_id
          and platform_role.role::text in ('super_admin', 'systems_admin')
          and platform_role.revoked_at is null
      )
    )
  then
    raise exception 'SuperPanel entitlements are managed through Systems platform roles.';
  end if;
  return new;
end;
$$;

create trigger entitlements_enforce_superpanel_source
before insert or update of application_id, role_id, user_id, revoked_at
on entitlements
for each row execute function enforce_superpanel_entitlement_source();

create or replace function sync_superpanel_entitlement_from_platform_role()
returns trigger
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_entitlement_id uuid;
  v_revoked_count integer;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  if exists (
    select 1
    from user_platform_roles platform_role
    where platform_role.user_id = v_user_id
      and platform_role.role::text in ('super_admin', 'systems_admin')
      and platform_role.revoked_at is null
  ) then
    if not exists (
      select 1
      from entitlements entitlement
      where entitlement.application_id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'
        and entitlement.user_id = v_user_id
        and entitlement.role_id = '0ab6228f-acde-44df-aef3-9475d30f72e1'
        and entitlement.revoked_at is null
    ) then
      insert into entitlements (
        application_id, role_id, subject_type, user_id, granted_by_user_id
      ) values (
        '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
        '0ab6228f-acde-44df-aef3-9475d30f72e1',
        'user',
        v_user_id,
        case when tg_op = 'DELETE' then old.granted_by_user_id else new.granted_by_user_id end
      )
      returning id into v_entitlement_id;

      insert into audit_events (
        action, outcome, application_id, target_type, target_id, metadata
      ) values (
        'entitlement.superpanel_role_synced',
        'success',
        '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
        'entitlement',
        v_entitlement_id::text,
        jsonb_build_object('source', 'systems_platform_role', 'level', 'admin')
      );
    end if;
  else
    update entitlements
    set revoked_at = now(), revoked_reason = 'Systems platform role removed.'
    where application_id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'
      and user_id = v_user_id
      and revoked_at is null;
    get diagnostics v_revoked_count = row_count;

    if v_revoked_count > 0 then
      insert into audit_events (
        action, outcome, application_id, target_type, target_id, metadata
      ) values (
        'entitlement.superpanel_role_revoked',
        'success',
        '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31',
        'user',
        v_user_id::text,
        jsonb_build_object('source', 'systems_platform_role')
      );
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger user_platform_roles_sync_superpanel_entitlement
after insert or update of role, revoked_at or delete
on user_platform_roles
for each row execute function sync_superpanel_entitlement_from_platform_role();
