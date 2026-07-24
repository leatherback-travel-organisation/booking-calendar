-- BotSwarm is Cove's governed home for narrow operational automations. Secrets
-- remain in the deployment secret store; these tables contain configuration,
-- redacted evidence and immutable human decisions only.

insert into applications (id, slug, name, description, launch_url, owner_name, status, risk, allows_employees, allows_external_partners)
values ('dc84d929-96f5-4dab-afd0-fb8144596b4a','botswarm','BotSwarm','Governed operational bots, review matching and human approval queues.','https://lbcove.vercel.app/botswarm','Systems & Automation','active','restricted',true,false)
on conflict (id) do update set slug=excluded.slug,name=excluded.name,description=excluded.description,launch_url=excluded.launch_url,owner_name=excluded.owner_name,status=excluded.status,risk=excluded.risk,updated_at=now();

insert into application_roles (id,application_id,role_key,name,access_level,allows_employees,allows_external_partners) values
 ('934b3e3f-73a9-47b9-8980-01594441bfe7','dc84d929-96f5-4dab-afd0-fb8144596b4a','user','BotSwarm User','user',true,false),
 ('62b15bbb-7914-422c-ac19-d45a885454fd','dc84d929-96f5-4dab-afd0-fb8144596b4a','admin','BotSwarm Admin','admin',true,false)
on conflict (id) do update set name=excluded.name,access_level=excluded.access_level;

insert into role_permissions (role_id,permission) values
 ('934b3e3f-73a9-47b9-8980-01594441bfe7','botswarm.read'),
 ('62b15bbb-7914-422c-ac19-d45a885454fd','botswarm.read'),
 ('62b15bbb-7914-422c-ac19-d45a885454fd','botswarm.review'),
 ('62b15bbb-7914-422c-ac19-d45a885454fd','botswarm.run'),
 ('62b15bbb-7914-422c-ac19-d45a885454fd','botswarm.configure')
on conflict do nothing;

insert into entitlements (application_id,role_id,subject_type,user_id,granted_by_user_id)
select distinct on (p.user_id) 'dc84d929-96f5-4dab-afd0-fb8144596b4a','62b15bbb-7914-422c-ac19-d45a885454fd','user',p.user_id,p.granted_by_user_id
from user_platform_roles p where p.role::text='super_admin' and p.revoked_at is null
and not exists (select 1 from entitlements e where e.application_id='dc84d929-96f5-4dab-afd0-fb8144596b4a' and e.user_id=p.user_id and e.revoked_at is null)
order by p.user_id,p.granted_at;

create table botswarm_bots (
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
 description text not null, status text not null check(status in ('active','paused','draft')),
 schedule text, owner text not null, configuration jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table botswarm_runs (
 id uuid primary key default gen_random_uuid(), bot_id uuid not null references botswarm_bots(id),
 trigger_type text not null check(trigger_type in ('scheduled','manual','retry')),
 status text not null check(status in ('queued','running','succeeded','partial','failed')),
 started_at timestamptz, completed_at timestamptz, scanned_count integer not null default 0,
 inserted_count integer not null default 0, matched_count integer not null default 0,
 review_count integer not null default 0, failed_count integer not null default 0, redacted_error text
);
create index botswarm_runs_bot_time on botswarm_runs(bot_id,started_at desc);

create table botswarm_external_reviews (
 id uuid primary key default gen_random_uuid(), brand_name text not null, provider text not null,
 external_review_id text not null, rating integer not null check(rating between 1 and 5),
 reviewer_display_name text, review_text text, review_created_at timestamptz not null,
 review_updated_at timestamptz not null, fetched_at timestamptz not null default now(),
 raw_expires_at timestamptz not null, content_hash text not null,
 state text not null check(state in ('detected','matched','needs_review','ignored','write_failed')),
 matched_guest_record_id text, matched_booking_id text, match_confidence numeric check(match_confidence between 0 and 1),
 sentiment jsonb not null default '{}', airtable_review_record_id text,
 unique(provider,brand_name,external_review_id)
);
create index botswarm_reviews_queue on botswarm_external_reviews(state,review_updated_at desc);

create table botswarm_match_candidates (
 review_id uuid not null references botswarm_external_reviews(id) on delete cascade,
 guest_record_id text not null, booking_id text, score numeric not null check(score between 0 and 1),
 rank integer not null check(rank>0), evidence jsonb not null default '{}',
 unique(review_id,guest_record_id,booking_id)
);
create table botswarm_review_decisions (
 id uuid primary key default gen_random_uuid(), review_id uuid not null references botswarm_external_reviews(id),
 decision text not null check(decision in ('assign','reassign','ignore','defer')),
 prior_guest_id text, chosen_guest_id text, actor_user_id uuid not null references users(id),
 reason text not null, created_at timestamptz not null default now()
);
create table botswarm_feed_events (
 id uuid primary key default gen_random_uuid(), bot_id uuid not null references botswarm_bots(id),
 run_id uuid references botswarm_runs(id), review_id uuid references botswarm_external_reviews(id),
 event_type text not null, severity text not null check(severity in ('info','warning','critical')),
 title text not null, detail text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index botswarm_feed_time on botswarm_feed_events(bot_id,created_at desc);

-- Session evidence records app usage without storing IP addresses, raw user agents
-- or provider session identifiers.
create table application_sessions (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references applications(id),
 user_id uuid not null references users(id), session_hash text not null,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 last_access_level text not null check(last_access_level in ('user','admin')),
 device_category text check(device_category in ('desktop','mobile','tablet','unknown')),
 unique(application_id,user_id,session_hash)
);
create index application_sessions_recent on application_sessions(application_id,last_seen_at desc);

-- The UI is a control plane. Backup bytes belong in separately credentialled,
-- encrypted object storage and restores always target isolation first.
create table backup_policies (
 id uuid primary key default gen_random_uuid(), source text not null unique, cadence text not null,
 retention_days integer not null check(retention_days>0), enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
create table backup_runs (
 id uuid primary key default gen_random_uuid(), policy_id uuid not null references backup_policies(id),
 trigger_type text not null check(trigger_type in ('scheduled','manual','drill')),
 state text not null check(state in ('queued','running','verified','failed')),
 started_at timestamptz, completed_at timestamptz, artifact_count integer not null default 0,
 redacted_error text, initiated_by_user_id uuid references users(id)
);
create table backup_artifacts (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references backup_runs(id),
 storage_reference text not null, sha256 text not null, byte_count bigint not null check(byte_count>=0),
 encrypted boolean not null, created_at timestamptz not null default now()
);
create table restore_drills (
 id uuid primary key default gen_random_uuid(), backup_run_id uuid not null references backup_runs(id),
 isolated_target text not null, state text not null check(state in ('queued','restoring','verified','failed')),
 verification_results jsonb not null default '{}', started_at timestamptz, completed_at timestamptz,
 approved_by_user_id uuid not null references users(id)
);
