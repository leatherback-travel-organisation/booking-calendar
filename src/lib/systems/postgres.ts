import "server-only";

import type { AuthorizedProvisionApplicationCommand, ProvisionedApplication } from "@/lib/access/systems-port";
import { getSql } from "@/lib/db/neon";
import type { ExistingAssetRegistration } from "./registration";
import type { ManagedAssetProfileUpdate } from "./registration";
import type { ManagedAsset } from "./model";
import { parseManagedAssetRows } from "./registry";

type Row = Record<string, unknown>;

function databaseBoolean(value: unknown) {
  return value === true || value === "true";
}

function requiredString(value: unknown, description: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${description} is missing.`);
  return value.trim();
}

export async function getPostgresManagedAssets(): Promise<readonly ManagedAsset[]> {
  const rows = await getSql()`select
      asset.*,
      owner.display_name as product_owner_name,
      coalesce(policy.employee_access_policy, 'selected') as employee_access_policy,
      coalesce(members.user_ids, '{}') as member_user_ids
    from managed_assets asset
    left join users owner on owner.id = asset.product_owner_user_id
    left join application_access_policies policy on policy.application_id = asset.application_id
    left join lateral (
      select array_agg(member.user_id::text order by member.user_id::text) as user_ids
      from managed_asset_members member where member.asset_id = asset.id
    ) members on true
    order by asset.asset_kind, asset.name` as Row[];
  return parseManagedAssetRows(rows);
}

export async function registerPostgresWebsiteAsset(input: Omit<ExistingAssetRegistration, "assetKind" | "repositoryUrl" | "productionUrl"> & {
  assetKind: "website";
  actorUserId: string;
  slug: string;
  applicationId?: string;
  repositoryPath: string | null;
  repositoryUrl: string | null;
  productionUrl: string;
}): Promise<{ assetId: string; duplicate: boolean }> {
  if (input.assetKind !== "website" || input.applicationId) throw new Error("Website registration cannot create or reference a Cove application.");
  const memberIds = JSON.stringify(input.teamMemberUserIds);
  const metadata = JSON.stringify({
    kind: input.assetKind,
    slug: input.slug,
    repository: input.repositoryPath,
    member_count: input.teamMemberUserIds.length,
  });

  const rows = await getSql()`with actor as (
      select u.id
      from users u
      where u.id = ${input.actorUserId}
        and u.population = 'employee'
        and u.status = 'active'
        and exists (
          select 1 from user_platform_roles role
          where role.user_id = u.id
            and role.role::text in ('super_admin', 'systems_admin')
            and role.revoked_at is null
        )
    ), previous as (
      select id from managed_assets where registration_request_id = ${input.requestId}
    ), owner as (
      select u.id
      from users u
      where u.id = ${input.productOwnerUserId}
        and is_approved_cove_employee(u.id)
    ), requested_members as (
      select distinct value::uuid as id
      from jsonb_array_elements_text(${memberIds}::jsonb)
      where value::uuid <> ${input.productOwnerUserId}::uuid
    ), valid_members as (
      select u.id
      from users u join requested_members requested on requested.id = u.id
      where is_approved_cove_employee(u.id)
    ), counts as (
      select
        (select count(*) from requested_members)::int as requested_count,
        (select count(*) from valid_members)::int as valid_count
    ), linked_application as (
      select id from applications
      where ${input.applicationId ?? null}::uuid is not null
        and id = ${input.applicationId ?? null}::uuid
    ), conflicts as (
      select
        exists(select 1 from managed_assets where slug = ${input.slug}) as slug_exists,
        exists(select 1 from managed_assets where ${input.repositoryPath}::text is not null and lower(repository_path) = lower(${input.repositoryPath})) as repository_exists,
        exists(select 1 from managed_assets where ${input.applicationId ?? null}::uuid is not null and application_id = ${input.applicationId ?? null}::uuid) as application_exists
    ), created as (
      insert into managed_assets (
        asset_kind, application_id, slug, name, description,
        product_owner_user_id, repository_path, repository_url,
        production_url, risk, status, registration_request_id, created_by_user_id
      )
      select
        ${input.assetKind}::managed_asset_kind,
        case when ${input.assetKind} = 'application' then linked_application.id else null end,
        ${input.slug}, ${input.name}, ${input.description}, owner.id,
        ${input.repositoryPath}, ${input.repositoryUrl}, ${input.productionUrl},
        ${input.risk}::application_risk, 'active', ${input.requestId}, actor.id
      from actor, owner, counts, conflicts
      left join linked_application on true
      where not exists(select 1 from previous)
        and counts.requested_count = counts.valid_count
        and conflicts.slug_exists = false
        and conflicts.repository_exists = false
        and conflicts.application_exists = false
        and ((${input.assetKind} = 'application' and linked_application.id is not null) or ${input.assetKind} = 'website')
      returning id, application_id
    ), members as (
      insert into managed_asset_members (asset_id, user_id, added_by_user_id)
      select created.id, member.id, ${input.actorUserId}
      from created cross join valid_members member
      returning user_id
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, application_id, target_type, target_id, request_id, metadata)
      select
        'systems.asset_registered', 'success', ${input.actorUserId}, created.application_id,
        case when created.application_id is null then null else 'application' end,
        created.application_id::text, ${input.requestId}, ${metadata}::jsonb
      from created
    )
    select
      exists(select 1 from actor) as actor_authorized,
      exists(select 1 from owner) as owner_exists,
      (select requested_count = valid_count from counts) as members_valid,
      (${input.assetKind} = 'website' or exists(select 1 from linked_application)) as application_valid,
      (select slug_exists from conflicts) as slug_exists,
      (select repository_exists from conflicts) as repository_exists,
      (select application_exists from conflicts) as application_exists,
      coalesce((select id::text from created), (select id::text from previous)) as asset_id,
      exists(select 1 from previous) as duplicate` as Row[];

  const row = rows[0] ?? {};
  if (!databaseBoolean(row.actor_authorized)) throw new Error("Systems operator access is required.");
  if (!databaseBoolean(row.owner_exists)) throw new Error("Choose an active or invited Cove employee as product owner.");
  if (!databaseBoolean(row.members_valid)) throw new Error("One or more selected team members are no longer active or invited in Cove.");
  if (!databaseBoolean(row.application_valid)) throw new Error("The canonical application record is missing.");
  if (databaseBoolean(row.slug_exists) && !databaseBoolean(row.duplicate)) throw new Error("An asset with this name is already registered.");
  if (databaseBoolean(row.repository_exists) && !databaseBoolean(row.duplicate)) throw new Error("This GitHub repository is already registered.");
  if (databaseBoolean(row.application_exists) && !databaseBoolean(row.duplicate)) throw new Error("This application is already linked to a systems asset.");
  return { assetId: requiredString(row.asset_id, "The managed asset ID"), duplicate: databaseBoolean(row.duplicate) };
}

export async function registerPostgresApplicationAsset(
  command: AuthorizedProvisionApplicationCommand,
  metadata: {
    risk: ExistingAssetRegistration["risk"];
    repositoryPath: string | null;
    repositoryUrl: string | null;
  },
): Promise<ProvisionedApplication & { assetId: string }> {
  const memberIds = JSON.stringify(command.memberUserIds);
  const auditMetadata = JSON.stringify({
    kind: "application",
    slug: command.slug,
    repository: metadata.repositoryPath,
    member_count: command.memberUserIds.length,
    employee_access_policy: command.employeeAccessPolicy,
  });

  const rows = await getSql()`with evergreen_lock as (
      select pg_advisory_xact_lock(hashtext('cove-evergreen-application-access'))
    ), provisioned as (
      select provisioned.*
      from evergreen_lock
      cross join lateral provision_application_access(
          ${command.actorUserId}::uuid,
          ${command.requestId},
          ${command.slug},
          ${command.name},
          ${command.description},
          ${command.launchUrl},
          ${command.ownerUserId}::uuid,
          array(select value::uuid from jsonb_array_elements_text(${memberIds}::jsonb)),
          ${command.employeeAccessPolicy}
        ) provisioned
    ), previous as (
      select id, application_id
      from managed_assets
      where registration_request_id = ${command.requestId}::uuid
    ), created_asset as (
      insert into managed_assets (
        asset_kind, application_id, slug, name, description,
        product_owner_user_id, repository_path, repository_url,
        production_url, risk, status, registration_request_id, created_by_user_id
      )
      select
        'application', provisioned.application_id, command.slug, command.name, command.description,
        ${command.ownerUserId}::uuid, ${metadata.repositoryPath}, ${metadata.repositoryUrl},
        ${command.launchUrl}, ${metadata.risk}::application_risk, 'maintenance', ${command.requestId}::uuid, ${command.actorUserId}::uuid
      from provisioned
      cross join lateral (select ${command.slug} as slug, ${command.name} as name, ${command.description} as description) command
      where not exists(select 1 from previous)
      returning id, application_id
    ), synced_application as (
      update applications application
      set status = 'maintenance',
          risk = ${metadata.risk}::application_risk,
          repository_path = ${metadata.repositoryPath},
          repository_url = ${metadata.repositoryUrl},
          updated_at = now()
      from created_asset
      where application.id = created_asset.application_id
      returning application.id
    ), members as (
      insert into managed_asset_members (asset_id, user_id, added_by_user_id)
      select created_asset.id, member_id, ${command.actorUserId}::uuid
      from created_asset
      cross join unnest(array(select value::uuid from jsonb_array_elements_text(${memberIds}::jsonb))) member_id
      where member_id <> ${command.ownerUserId}::uuid
      returning user_id
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, application_id, target_type, target_id, request_id, metadata)
      select
        'systems.asset_registered', 'success', ${command.actorUserId}::uuid, created_asset.application_id,
        'application', created_asset.application_id::text, ${command.requestId}, ${auditMetadata}::jsonb
      from created_asset
    )
    select
      provisioned.application_id::text as application_id,
      provisioned.application_slug,
      coalesce(created_asset.id::text, previous.id::text) as asset_id
    from provisioned
    left join created_asset on true
    left join previous on true` as Row[];

  const row = rows[0] ?? {};
  return {
    applicationId: requiredString(row.application_id, "The canonical application ID"),
    slug: requiredString(row.application_slug, "The application slug"),
    assetId: requiredString(row.asset_id, "The managed asset ID"),
  };
}

export async function updatePostgresManagedAsset(input: Omit<ManagedAssetProfileUpdate, "repositoryUrl" | "productionUrl"> & {
  actorUserId: string;
  repositoryPath: string | null;
  repositoryUrl: string | null;
  productionUrl: string;
}): Promise<{ duplicate: boolean }> {
  const memberIds = JSON.stringify(input.teamMemberUserIds);
  const auditMetadata = JSON.stringify({
    name: input.name,
    risk: input.risk,
    status: input.status,
    repository: input.repositoryPath,
    member_count: input.teamMemberUserIds.length,
    employee_access_policy: input.employeeAccessPolicy,
  });
  const rows = await getSql()`with evergreen_lock as (
      select pg_advisory_xact_lock(hashtext('cove-evergreen-application-access'))
    ), actor as (
      select u.id
      from users u
      where u.id = ${input.actorUserId}
        and u.population = 'employee'
        and u.status = 'active'
        and exists (
          select 1 from user_platform_roles role
          where role.user_id = u.id
            and role.role::text in ('super_admin', 'systems_admin')
            and role.revoked_at is null
        )
    ), claimed as (
      insert into mutation_keys (key, actor_user_id, action)
      select ${input.requestId}, actor.id, 'systems.asset_updated' from actor cross join evergreen_lock
      on conflict do nothing returning key
    ), target as (
      select id, asset_kind, application_id
      from managed_assets
      where id = ${input.assetId}
    ), owner as (
      select u.id, u.display_name
      from users u
      where u.id = ${input.productOwnerUserId}
        and is_approved_cove_employee(u.id)
    ), requested_members as (
      select distinct value::uuid as id
      from jsonb_array_elements_text(${memberIds}::jsonb)
      where value::uuid <> ${input.productOwnerUserId}::uuid
    ), valid_members as (
      select u.id
      from users u join requested_members requested on requested.id = u.id
      where is_approved_cove_employee(u.id)
    ), counts as (
      select
        (select count(*) from requested_members)::int as requested_count,
        (select count(*) from valid_members)::int as valid_count
    ), conflicts as (
      select exists(
        select 1 from managed_assets asset
        where ${input.repositoryPath}::text is not null
          and lower(asset.repository_path) = lower(${input.repositoryPath})
          and asset.id <> ${input.assetId}
      ) as repository_exists
    ), updated_asset as (
      update managed_assets asset
      set name = ${input.name},
          description = ${input.description},
          product_owner_user_id = owner.id,
          repository_path = ${input.repositoryPath},
          repository_url = ${input.repositoryUrl},
          production_url = ${input.productionUrl},
          risk = ${input.risk}::application_risk,
          status = ${input.status}::application_status,
          updated_at = now()
      from claimed, target, owner, counts, conflicts
      where asset.id = target.id
        and counts.requested_count = counts.valid_count
        and conflicts.repository_exists = false
      returning asset.id, asset.asset_kind, asset.application_id
    ), removed_members as (
      delete from managed_asset_members member
      using updated_asset
      where member.asset_id = updated_asset.id
      returning member.user_id
    ), added_members as (
      insert into managed_asset_members (asset_id, user_id, added_by_user_id)
      select updated_asset.id, member.id, ${input.actorUserId}
      from updated_asset cross join valid_members member
      returning user_id
    ), updated_application as (
      update applications application
      set name = ${input.name},
          description = ${input.description},
          launch_url = ${input.productionUrl},
          owner_name = owner.display_name,
          repository_path = ${input.repositoryPath},
          repository_url = ${input.repositoryUrl},
          risk = ${input.risk}::application_risk,
          status = ${input.status}::application_status,
          updated_at = now()
      from updated_asset, owner
      where updated_asset.asset_kind = 'application'
        and application.id = updated_asset.application_id
      returning application.id
    ), updated_access_policy as (
      insert into application_access_policies (
        application_id, employee_access_policy, configured_by_user_id
      )
      select
        updated_asset.application_id, ${input.employeeAccessPolicy}, ${input.actorUserId}
      from updated_asset
      where updated_asset.asset_kind = 'application'
        and updated_asset.application_id is not null
      on conflict (application_id) do update
        set employee_access_policy = excluded.employee_access_policy,
            configured_by_user_id = excluded.configured_by_user_id,
            updated_at = now()
      returning application_id, employee_access_policy
    ), evergreen_grants as (
      insert into entitlements (
        application_id, role_id, subject_type, user_id, granted_by_user_id
      )
      select
        policy.application_id, role.id, 'user', employee.id, ${input.actorUserId}
      from updated_access_policy policy
      join application_roles role
        on role.application_id = policy.application_id
       and role.role_key = 'user'
       and role.access_level = 'user'
       and role.allows_employees = true
      join users employee
        on is_approved_cove_employee(employee.id)
      where policy.employee_access_policy = 'all'
        and not exists (
          select 1
          from entitlements entitlement
          where entitlement.application_id = policy.application_id
            and entitlement.user_id = employee.id
            and entitlement.revoked_at is null
            and (entitlement.starts_at is null or entitlement.starts_at <= now())
            and (entitlement.expires_at is null or entitlement.expires_at > now())
        )
      returning id, application_id, user_id
    ), evergreen_audited as (
      insert into audit_events (
        action, outcome, actor_user_id, application_id,
        target_type, target_id, request_id, metadata
      )
      select
        'entitlement.evergreen_access_granted', 'success', ${input.actorUserId}, grant.application_id,
        'entitlement', grant.id::text, ${input.requestId},
        jsonb_build_object('user_id', grant.user_id::text, 'level', 'user', 'policy', 'all')
      from evergreen_grants grant
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, application_id, target_type, target_id, request_id, metadata)
      select
        'systems.asset_updated', 'success', ${input.actorUserId}, updated_asset.application_id,
        case when updated_asset.application_id is null then null else 'application' end,
        updated_asset.application_id::text, ${input.requestId}, ${auditMetadata}::jsonb
      from updated_asset
    )
    select
      exists(select 1 from actor) as actor_authorized,
      exists(select 1 from claimed) as claimed,
      exists(select 1 from target) as target_exists,
      exists(select 1 from owner) as owner_exists,
      (select requested_count = valid_count from counts) as members_valid,
      (select repository_exists from conflicts) as repository_exists,
      exists(select 1 from updated_asset) as updated` as Row[];

  const row = rows[0] ?? {};
  if (!databaseBoolean(row.actor_authorized)) throw new Error("Systems operator access is required.");
  if (!databaseBoolean(row.target_exists)) throw new Error("This managed asset no longer exists.");
  if (!databaseBoolean(row.owner_exists)) throw new Error("Choose an active or invited Cove employee as product owner.");
  if (!databaseBoolean(row.members_valid)) throw new Error("One or more selected team members are no longer active or invited in Cove.");
  if (databaseBoolean(row.repository_exists)) throw new Error("This GitHub repository is already registered to another asset.");
  if (databaseBoolean(row.claimed) && !databaseBoolean(row.updated)) throw new Error("The asset profile could not be updated.");
  return { duplicate: !databaseBoolean(row.claimed) };
}
