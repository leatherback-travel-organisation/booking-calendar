-- Register SuperPanel in its own systems inventory after Auth has created the
-- canonical Cove application record. The Apps workspace remains entitlement-
-- derived; this row contains only operational GitHub/Vercel metadata.

insert into managed_assets (
  id,
  asset_kind,
  application_id,
  slug,
  name,
  description,
  product_owner_user_id,
  production_url,
  risk,
  status,
  created_by_user_id
)
select
  'd49d6bd7-b8e6-48bb-8ed8-9800cd5bb348',
  'application',
  application.id,
  application.slug,
  application.name,
  application.description,
  administrator.user_id,
  application.launch_url,
  application.risk,
  application.status,
  administrator.user_id
from applications application
cross join lateral (
  select platform_role.user_id
  from user_platform_roles platform_role
  join users user_record on user_record.id = platform_role.user_id
  where platform_role.role = 'super_admin'
    and platform_role.revoked_at is null
    and user_record.status = 'active'
  order by platform_role.granted_at
  limit 1
) administrator
where application.id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'
on conflict (application_id) do update set
  production_url = excluded.production_url,
  product_owner_user_id = coalesce(managed_assets.product_owner_user_id, excluded.product_owner_user_id),
  updated_at = now();
