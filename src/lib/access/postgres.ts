import "server-only";

import type { VerifiedIdentity } from "@/lib/identity/types";
import { getSql } from "@/lib/db/neon";
import type { AccessDirectory } from "./admin-model";
import { parseAuditRows, type AuditFeed } from "./audit-integrity";
import { parseAccessDirectoryRows } from "./directory-integrity";
import {
  requireMutationAuthorization,
  resolveMutationOutcome,
  type MutationOutcome,
} from "./mutations";
import { retiredClerkIssuers, shouldRebindRetiredClerkIssuer } from "./identity-migration";
import { parseAccessPolicyRows } from "./policy-integrity";
import { parseApplicationRegistry } from "./registry";
import type { AccessSnapshot, ApplicationAccessLevel } from "./model";

type Row = Record<string, unknown>;

function boolean(value: unknown) {
  return value === true || value === "true";
}

export async function getPostgresAccessSnapshot(): Promise<AccessSnapshot> {
  const sql = getSql();
  const [userReferenceRows, userRows, roleRows, organisationRows, teamRows, membershipRows, applicationRows, applicationRoleRows, entitlementRows] = await sql.transaction((tx) => [
    tx`select id from users`,
    tx`select u.*, i.subject as identity_subject, i.issuer as identity_issuer
       from users u join identities i on i.user_id = u.id`,
    tx`select user_id, role, granted_by_user_id from user_platform_roles where revoked_at is null`,
    tx`select id, name, status from partner_organisations`,
    tx`select id, name, description, status from teams`,
    tx`select team_id, user_id, starts_at, expires_at, revoked_at, granted_by_user_id from team_memberships`,
    tx`select * from applications`,
    tx`select ar.*, coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}') as permissions
       from application_roles ar left join role_permissions rp on rp.role_id = ar.id
       group by ar.id`,
    tx`select e.*, coalesce(array_agg(eps.partner_organisation_id::text) filter (where eps.partner_organisation_id is not null), '{}') as partner_organisation_ids
       from entitlements e left join entitlement_partner_organisation_scopes eps on eps.entitlement_id = e.id
       group by e.id`,
  ], { readOnly: true });

  return parseAccessPolicyRows({
    userReferenceRows: userReferenceRows as Row[],
    userRows: userRows as Row[],
    platformRoleRows: roleRows as Row[],
    organisationRows: organisationRows as Row[],
    teamRows: teamRows as Row[],
    membershipRows: membershipRows as Row[],
    applicationRows: applicationRows as Row[],
    applicationRoleRows: applicationRoleRows as Row[],
    entitlementRows: entitlementRows as Row[],
  });
}

export async function getPostgresAccessDirectory(): Promise<AccessDirectory> {
  const sql = getSql();
  const [personRows, applicationRows] = await sql.transaction((tx) => [
    tx`select
         u.id,
         u.population,
         u.email,
         u.display_name,
         u.status,
         identity.identity_count,
         identity.last_authenticated_at,
         invitation.invited_at,
         invitation.expires_at as invitation_expires_at,
         invitation.status as invitation_status,
         coalesce(platform.roles, '[]'::jsonb) as platform_roles,
         coalesce(apps.access, '{}'::jsonb) as application_access
       from users u
       left join lateral (
         select count(*)::int as identity_count, max(i.last_authenticated_at) as last_authenticated_at
         from identities i where i.user_id = u.id
       ) identity on true
       left join lateral (
         select ui.invited_at, ui.expires_at, ui.status
         from user_invitations ui
         where lower(ui.email) = lower(u.email)
         order by ui.invited_at desc limit 1
       ) invitation on true
       left join lateral (
         select jsonb_agg(upr.role order by upr.role) as roles
         from user_platform_roles upr
         where upr.user_id = u.id and upr.revoked_at is null
       ) platform on true
       left join lateral (
         select jsonb_object_agg(a.slug, ar.access_level) as access
         from entitlements e
         join applications a on a.id = e.application_id
         join application_roles ar on ar.id = e.role_id
         where e.user_id = u.id and e.revoked_at is null
           and (e.starts_at is null or e.starts_at <= now())
           and (e.expires_at is null or e.expires_at > now())
       ) apps on true
       order by u.display_name, u.email`,
    tx`select application.*, coalesce(policy.employee_access_policy, 'selected') as employee_access_policy
       from applications application
       left join application_access_policies policy on policy.application_id = application.id
       order by application.name`,
  ], { readOnly: true });

  const directory = parseAccessDirectoryRows({
    personRows: personRows as Row[],
    applicationRows: applicationRows as Row[],
  });
  return { ...directory, writable: true, source: "postgres" };
}

export async function getPostgresAuditFeed(): Promise<AuditFeed> {
  const rows = await getSql()`select
      ae.id,
      ae.occurred_at,
      ae.action,
      ae.outcome,
      ae.actor_user_id,
      ae.actor_identity_subject,
      actor.display_name as actor_name,
      ae.application_id,
      application.name as application_name,
      ae.target_type,
      ae.target_id,
      ae.request_id,
      ae.metadata
    from audit_events ae
    left join users actor on actor.id = ae.actor_user_id
    left join applications application on application.id = ae.application_id
    order by ae.occurred_at desc, ae.id desc
    limit 100` as Row[];

  return {
    events: parseAuditRows(rows),
    source: "postgres",
    message: "Showing up to 100 recent append-only security and access events.",
  };
}

export async function postgresApplicationRegistryHealthy(): Promise<boolean> {
  try {
    const rows = await getSql()`select * from applications` as Row[];
    parseApplicationRegistry(rows);
    return true;
  } catch {
    return false;
  }
}

export async function postgresAccessPolicyHealthy(): Promise<boolean> {
  try {
    await getPostgresAccessSnapshot();
    return true;
  } catch {
    return false;
  }
}

export async function postgresAccessDirectoryHealthy(): Promise<boolean> {
  try {
    await getPostgresAccessDirectory();
    return true;
  } catch {
    return false;
  }
}

export async function postgresAuditFeedHealthy(): Promise<boolean> {
  try {
    await getPostgresAuditFeed();
    return true;
  } catch {
    return false;
  }
}

export async function bindInvitedIdentity(identity: VerifiedIdentity) {
  const sql = getSql();
  const rows = await sql`with candidate as (
      select ui.id as invitation_id, u.id as user_id
      from users u
      join user_invitations ui on lower(ui.email) = lower(u.email)
      where lower(u.email) = lower(${identity.email})
        and ui.status = 'pending'
        and (ui.expires_at is null or ui.expires_at > now())
      order by ui.invited_at desc
      for update of ui
      limit 1
    ), bound as (
      insert into identities (user_id, issuer, subject, email_verified_at, last_authenticated_at)
      select user_id, ${identity.issuer}, ${identity.subject}, ${identity.verifiedAt}, now()
      from candidate
      on conflict (issuer, subject) do update
        set last_authenticated_at = now()
        where identities.user_id = excluded.user_id
      returning user_id
    ), accepted as (
      update user_invitations ui
      set status = 'accepted', accepted_at = now(), accepted_user_id = candidate.user_id
      from candidate
      join bound on bound.user_id = candidate.user_id
      where ui.id = candidate.invitation_id and ui.status = 'pending'
      returning candidate.user_id
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, actor_identity_subject, target_type, target_id, metadata)
      select 'identity.invitation_accepted', 'success', user_id, ${identity.subject}, 'user', user_id::text, '{}'::jsonb
      from accepted
    )
    select user_id from accepted` as Row[];
  return rows.length === 1;
}

export async function rebindRetiredClerkIdentity(identity: VerifiedIdentity) {
  const retiredIssuers = retiredClerkIssuers();
  if (
    identity.population !== "employee" ||
    !identity.emailVerified ||
    !shouldRebindRetiredClerkIssuer({ currentIssuer: identity.issuer, retiredIssuers })
  ) {
    return false;
  }

  const sql = getSql();
  const rows = await sql`with retired_issuers as (
      select value as issuer
      from jsonb_array_elements_text(${JSON.stringify(retiredIssuers)}::jsonb)
    ), candidate as (
      select i.id as identity_id,
             i.user_id,
             i.issuer as old_issuer,
             i.subject as old_subject
      from users u
      join identities i on i.user_id = u.id
      join retired_issuers retired on retired.issuer = i.issuer
      where lower(u.email) = lower(${identity.email})
        and u.population = 'employee'
        and u.status = 'active'
        and not exists (
          select 1 from identities existing
          where existing.issuer = ${identity.issuer}
            and existing.subject = ${identity.subject}
            and existing.id <> i.id
        )
      order by i.last_authenticated_at desc nulls last, i.created_at desc
      for update of i
      limit 1
    ), rebound as (
      update identities i
      set issuer = ${identity.issuer},
          subject = ${identity.subject},
          email_verified_at = ${identity.verifiedAt},
          last_authenticated_at = now()
      from candidate
      where i.id = candidate.identity_id
      returning candidate.user_id,
                candidate.old_issuer,
                candidate.old_subject
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, actor_identity_subject, target_type, target_id, metadata)
      select
        'identity.provider_migrated',
        'success',
        user_id,
        ${identity.subject},
        'user',
        user_id::text,
        jsonb_build_object(
          'from_issuer', old_issuer,
          'from_subject', old_subject,
          'to_issuer', ${identity.issuer}::text,
          'reason', 'clerk_production_cutover'
        )
      from rebound
    )
    select user_id from rebound` as Row[];

  return rows.length === 1;
}

export async function touchIdentityAuthentication(identity: VerifiedIdentity) {
  const sql = getSql();
  await sql`update identities set last_authenticated_at = now()
    where issuer = ${identity.issuer} and subject = ${identity.subject}`;
}

export async function bootstrapFirstAdmin(identity: VerifiedIdentity) {
  const bootstrapEmail = process.env.COVE_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!bootstrapEmail || identity.email.toLowerCase() !== bootstrapEmail) return false;
  const sql = getSql();
  const counts = await sql`select count(*)::int as count from users` as Row[];
  if (Number(counts[0]?.count) !== 0) return false;
  await sql`with created_user as (
      insert into users (population, email, display_name, status, workspace_domain)
      values ('employee', ${identity.email.toLowerCase()}, ${identity.displayName}, 'active', ${identity.workspaceDomain ?? "leatherbacktravel.com"})
      returning id
    ), created_identity as (
      insert into identities (user_id, issuer, subject, email_verified_at, last_authenticated_at)
      select id, ${identity.issuer}, ${identity.subject}, ${identity.verifiedAt}, now() from created_user
    ), created_role as (
      insert into user_platform_roles (user_id, role, granted_by_user_id)
      select id, 'super_admin', id from created_user
    ), created_entitlements as (
      insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
      select application.id, role.id, 'user', created_user.id, created_user.id
      from created_user
      join applications application
        on application.status = 'active' and application.allows_employees = true
      join application_roles role
        on role.application_id = application.id
       and role.access_level = 'admin'
       and role.allows_employees = true
      returning application_id
    )
    insert into audit_events (action, outcome, actor_user_id, actor_identity_subject, target_type, target_id, metadata)
    select 'identity.bootstrap_admin', 'success', id, ${identity.subject}, 'user', id::text, '{"one_time":true}'::jsonb from created_user
    union all
    select 'entitlement.bootstrap_admin_application', 'success', created_user.id, ${identity.subject}, 'application', created_entitlements.application_id::text, '{"level":"admin"}'::jsonb
    from created_user cross join created_entitlements`;
  return true;
}

export async function invitePostgresUser(input: { name: string; email: string; actorUserId: string; requestId: string }) {
  const sql = getSql();
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const rows = await sql`with evergreen_lock as (
      select pg_advisory_xact_lock(hashtext('cove-evergreen-application-access'))
    ), actor as (
      select u.id
      from users u
      where u.id = ${input.actorUserId}
        and u.population = 'employee'
        and u.status = 'active'
        and exists (
          select 1 from user_platform_roles upr
          where upr.user_id = u.id
            and upr.role in ('super_admin', 'access_admin')
            and upr.revoked_at is null
        )
    ), claimed as (
      insert into mutation_keys (key, actor_user_id, action)
      select ${input.requestId}, actor.id, 'user.invited' from actor cross join evergreen_lock
      on conflict do nothing returning key
    ), existing_identity as (
      select exists (
        select 1 from users u join identities i on i.user_id = u.id
        where lower(u.email) = lower(${input.email})
      ) as already_bound
    ), upserted_user as (
      insert into users (population, email, display_name, status, workspace_domain)
      select 'employee', lower(${input.email}), ${input.name}, 'active', 'leatherbacktravel.com'
      from claimed, existing_identity where existing_identity.already_bound = false
      on conflict (lower(email)) do update set display_name = excluded.display_name, updated_at = now()
        where not exists (select 1 from identities i where i.user_id = users.id)
      returning id
    ), invitation as (
      insert into user_invitations (email, display_name, invited_by_user_id, expires_at)
      select lower(${input.email}), ${input.name}, ${input.actorUserId}, ${expiresAt} from upserted_user
      on conflict (lower(email)) where status = 'pending'
      do update set display_name = excluded.display_name, invited_by_user_id = excluded.invited_by_user_id, invited_at = now(), expires_at = excluded.expires_at
      returning id
    ), evergreen_grants as (
      insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
      select policy.application_id, role.id, 'user', invited_user.id, ${input.actorUserId}
      from upserted_user invited_user
      join application_access_policies policy
        on policy.employee_access_policy = 'all'
      join application_roles role
        on role.application_id = policy.application_id
       and role.role_key = 'user'
       and role.access_level = 'user'
       and role.allows_employees = true
      where not exists (
        select 1
        from entitlements entitlement
        where entitlement.application_id = policy.application_id
          and entitlement.user_id = invited_user.id
          and entitlement.revoked_at is null
          and (entitlement.starts_at is null or entitlement.starts_at <= now())
          and (entitlement.expires_at is null or entitlement.expires_at > now())
      )
      returning id, application_id, user_id
    ), evergreen_audited as (
      insert into audit_events (action, outcome, actor_user_id, application_id, target_type, target_id, request_id, metadata)
      select
        'entitlement.evergreen_access_granted', 'success', ${input.actorUserId}, grant_result.application_id,
        'entitlement', grant_result.id::text, ${input.requestId},
        jsonb_build_object('user_id', grant_result.user_id::text, 'level', 'user', 'policy', 'all')
      from evergreen_grants grant_result
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
      select 'user.invited', 'success', ${input.actorUserId}, 'user', u.id::text, ${input.requestId}, jsonb_build_object('domain', 'leatherbacktravel.com')
      from upserted_user u
    )
    select exists(select 1 from actor) as actor_authorized,
           coalesce((select already_bound from existing_identity), false) as identity_exists,
           exists(select 1 from claimed) as claimed,
           exists(select 1 from upserted_user) as changed` as Row[];
  const row = rows[0] ?? {};
  requireMutationAuthorization(boolean(row.actor_authorized));
  if (boolean(row.identity_exists)) {
    throw new Error("This person has already signed in; invitations can only be renewed before identity binding.");
  }
  return boolean(row.claimed) && boolean(row.changed);
}

export async function updatePostgresUserStatus(input: { userId: string; status: "active" | "suspended"; actorUserId: string; requestId: string }): Promise<MutationOutcome> {
  const sql = getSql();
  const auditMetadata = JSON.stringify({ status: input.status });
  const rows = await sql`with actor as (
      select u.id
      from users u
      where u.id = ${input.actorUserId}
        and u.population = 'employee'
        and u.status = 'active'
        and exists (
          select 1 from user_platform_roles upr
          where upr.user_id = u.id
            and upr.role in ('super_admin', 'access_admin')
            and upr.revoked_at is null
        )
    ), claimed as (
      insert into mutation_keys (key, actor_user_id, action)
      select ${input.requestId}, actor.id, 'user.status_changed' from actor
      on conflict do nothing returning key
    ), target as (
      select u.id,
             exists (
               select 1 from user_platform_roles upr
               where upr.user_id = u.id
                 and upr.role = 'super_admin'
                 and upr.revoked_at is null
             ) as is_super_admin
      from users u where u.id = ${input.userId}
    ), changed as (
      update users u
      set status = ${input.status}, session_version = session_version + 1, updated_at = now()
      from claimed, target
      where u.id = target.id
        and (${input.status} <> 'suspended' or target.is_super_admin = false)
        and u.status is distinct from ${input.status}
      returning u.id
    ), audited as (
      insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
      select 'user.status_changed', 'success', ${input.actorUserId}, 'user', id::text, ${input.requestId}, ${auditMetadata}::jsonb
      from changed
    )
    select exists(select 1 from actor) as actor_authorized,
           exists(select 1 from claimed) as claimed,
           exists(select 1 from target) as target_exists,
           coalesce((select is_super_admin from target), false) as target_is_super_admin,
           exists(select 1 from changed) as changed` as Row[];
  const row = rows[0] ?? {};
  requireMutationAuthorization(boolean(row.actor_authorized));
  if (input.status === "suspended" && boolean(row.target_is_super_admin)) {
    throw new Error("Super-admin accounts cannot be suspended from Cove.");
  }
  return resolveMutationOutcome({
    claimed: boolean(row.claimed),
    changed: boolean(row.changed),
    requiredTargets: [{ exists: boolean(row.target_exists), description: "The person" }],
  });
}

export async function updatePostgresPlatformRole(input: { userId: string; enabled: boolean; role: "access_admin" | "systems_admin"; actorUserId: string; requestId: string }): Promise<MutationOutcome> {
  const sql = getSql();
  const auditMetadata = JSON.stringify({ role: input.role });
  let rows: Row[];
  if (input.enabled) {
    rows = await sql`with actor as (
        select u.id
        from users u
        where u.id = ${input.actorUserId}
          and u.population = 'employee'
          and u.status = 'active'
          and exists (
            select 1 from user_platform_roles upr
            where upr.user_id = u.id
              and upr.role in ('super_admin', 'access_admin')
              and upr.revoked_at is null
          )
      ), claimed as (
        insert into mutation_keys (key, actor_user_id, action)
        select ${input.requestId}, actor.id, 'user.platform_role_granted' from actor
        on conflict do nothing returning key
      ), target as (
        select id, population from users where id = ${input.userId}
      ), changed as (
        insert into user_platform_roles (user_id, role, granted_by_user_id)
        select target.id, ${input.role}::platform_role, ${input.actorUserId} from target cross join claimed
        where target.population = 'employee'
        on conflict (user_id, role) where revoked_at is null do nothing
        returning user_id
      ), audited as (
        insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
        select 'user.platform_role_granted', 'success', ${input.actorUserId}, 'user', user_id::text, ${input.requestId}, ${auditMetadata}::jsonb
        from changed
      )
      select exists(select 1 from actor) as actor_authorized,
             exists(select 1 from claimed) as claimed,
             exists(select 1 from target) as target_exists,
             coalesce((select population = 'employee' from target), false) as target_is_employee,
             exists(select 1 from changed) as changed` as Row[];
  } else {
    rows = await sql`with actor as (
        select u.id
        from users u
        where u.id = ${input.actorUserId}
          and u.population = 'employee'
          and u.status = 'active'
          and exists (
            select 1 from user_platform_roles upr
            where upr.user_id = u.id
              and upr.role in ('super_admin', 'access_admin')
              and upr.revoked_at is null
          )
      ), claimed as (
        insert into mutation_keys (key, actor_user_id, action)
        select ${input.requestId}, actor.id, 'user.platform_role_revoked' from actor
        on conflict do nothing returning key
      ), target as (
        select id, population from users where id = ${input.userId}
      ), changed as (
        update user_platform_roles upr
        set revoked_at = now()
        from claimed, target
        where upr.user_id = target.id and target.population = 'employee'
          and upr.role = ${input.role}::platform_role and upr.revoked_at is null
        returning upr.user_id
      ), audited as (
        insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
        select 'user.platform_role_revoked', 'success', ${input.actorUserId}, 'user', user_id::text, ${input.requestId}, ${auditMetadata}::jsonb
        from changed
      )
      select exists(select 1 from actor) as actor_authorized,
             exists(select 1 from claimed) as claimed,
             exists(select 1 from target) as target_exists,
             coalesce((select population = 'employee' from target), false) as target_is_employee,
             exists(select 1 from changed) as changed` as Row[];
  }
  const row = rows[0] ?? {};
  requireMutationAuthorization(boolean(row.actor_authorized));
  if (boolean(row.target_exists) && !boolean(row.target_is_employee)) {
    throw new Error("Cove platform administration can only be assigned to employees.");
  }
  return resolveMutationOutcome({
    claimed: boolean(row.claimed),
    changed: boolean(row.changed),
    requiredTargets: [{ exists: boolean(row.target_exists), description: "The person" }],
  });
}

export async function updatePostgresApplicationAccess(input: { userId: string; applicationSlug: string; level: ApplicationAccessLevel | null; actorUserId: string; requestId: string }): Promise<MutationOutcome> {
  const sql = getSql();
  const auditMetadata = JSON.stringify({ application: input.applicationSlug, level: input.level });
  let rows: Row[];
  if (input.level) {
    rows = await sql`with actor as (
        select u.id
        from users u
        where u.id = ${input.actorUserId}
          and u.population = 'employee'
          and u.status = 'active'
          and exists (
            select 1 from user_platform_roles upr
            where upr.user_id = u.id
              and upr.role in ('super_admin', 'access_admin')
              and upr.revoked_at is null
          )
      ), claimed as (
        insert into mutation_keys (key, actor_user_id, action)
        select ${input.requestId}, actor.id, 'entitlement.application_access_changed' from actor
        on conflict do nothing returning key
      ), target_user as (
        select id from users where id = ${input.userId} and population = 'employee'
      ), target_application as (
        select application.id,
               coalesce(policy.employee_access_policy, 'selected') as employee_access_policy
        from applications application
        left join application_access_policies policy on policy.application_id = application.id
        where application.slug = ${input.applicationSlug}
      ), target_role as (
        select ar.id
        from application_roles ar
        join target_application a on a.id = ar.application_id
        where a.employee_access_policy = 'selected'
          and ar.role_key = ${input.level} and ar.access_level = ${input.level}
          and ar.allows_employees = true
        limit 1
      ), revoked as (
        update entitlements e
        set revoked_at = now(), revoked_reason = 'Replaced by administrator'
        from claimed, target_user u, target_application a, target_role r
        where e.application_id = a.id and e.user_id = u.id and e.revoked_at is null
        returning e.id
      ), changed as (
        insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
        select a.id, r.id, 'user', u.id, ${input.actorUserId}
        from claimed, target_user u, target_application a, target_role r
        returning id
      ), audited as (
        insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
        select 'entitlement.application_access_changed', 'success', ${input.actorUserId}, 'user', ${input.userId}, ${input.requestId}, ${auditMetadata}::jsonb
        from changed
      )
      select exists(select 1 from actor) as actor_authorized,
             exists(select 1 from claimed) as claimed,
             exists(select 1 from target_user) as user_exists,
             exists(select 1 from target_application) as application_exists,
             coalesce((select employee_access_policy = 'all' from target_application), false) as application_is_evergreen,
             exists(select 1 from target_role) as role_exists,
             exists(select 1 from changed) as changed` as Row[];
  } else {
    rows = await sql`with actor as (
        select u.id
        from users u
        where u.id = ${input.actorUserId}
          and u.population = 'employee'
          and u.status = 'active'
          and exists (
            select 1 from user_platform_roles upr
            where upr.user_id = u.id
              and upr.role in ('super_admin', 'access_admin')
              and upr.revoked_at is null
          )
      ), claimed as (
        insert into mutation_keys (key, actor_user_id, action)
        select ${input.requestId}, actor.id, 'entitlement.application_access_changed' from actor
        on conflict do nothing returning key
      ), target_user as (
        select id from users where id = ${input.userId} and population = 'employee'
      ), target_application as (
        select application.id,
               coalesce(policy.employee_access_policy, 'selected') as employee_access_policy
        from applications application
        left join application_access_policies policy on policy.application_id = application.id
        where application.slug = ${input.applicationSlug}
      ), changed as (
        update entitlements e
        set revoked_at = now(), revoked_reason = 'Removed by administrator'
        from claimed, target_user u, target_application a
        where a.employee_access_policy = 'selected'
          and e.application_id = a.id and e.user_id = u.id and e.revoked_at is null
        returning e.id
      ), audited as (
        insert into audit_events (action, outcome, actor_user_id, target_type, target_id, request_id, metadata)
        select 'entitlement.application_access_changed', 'success', ${input.actorUserId}, 'user', ${input.userId}, ${input.requestId}, ${auditMetadata}::jsonb
        from (select 1 from changed limit 1) mutation
      )
      select exists(select 1 from actor) as actor_authorized,
             exists(select 1 from claimed) as claimed,
             exists(select 1 from target_user) as user_exists,
             exists(select 1 from target_application) as application_exists,
             coalesce((select employee_access_policy = 'all' from target_application), false) as application_is_evergreen,
             true as role_exists,
             exists(select 1 from changed) as changed` as Row[];
  }
  const row = rows[0] ?? {};
  requireMutationAuthorization(boolean(row.actor_authorized));
  if (boolean(row.application_is_evergreen)) {
    throw new Error("This application is enabled for everyone. Change its company-wide policy in SuperPanel instead.");
  }
  return resolveMutationOutcome({
    claimed: boolean(row.claimed),
    changed: boolean(row.changed),
    requiredTargets: [
      { exists: boolean(row.user_exists), description: "The employee" },
      { exists: boolean(row.application_exists), description: "The application" },
      { exists: boolean(row.role_exists), description: `The ${input.level ?? "requested"} application role` },
    ],
  });
}
