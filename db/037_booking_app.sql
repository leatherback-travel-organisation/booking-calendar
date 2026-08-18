-- Leatherback Booking: Calendly replacement for Booking Managers.
-- Registers the `booking` sub-app (role_key `user` = Booking Manager,
-- role_key `admin` = Pod Lead) and creates the operational schema.
--
-- Airtable stays the admin-maintained reference layer and is never written.
-- Everything the app creates lives here, in the `booking` schema.

create extension if not exists citext;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Application registration
-- ---------------------------------------------------------------------------

insert into applications (
  id, slug, name, description, launch_url, owner_name,
  status, risk, allows_employees, allows_external_partners
) values (
  '7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01',
  'booking',
  'Calltime',
  'Guest call scheduling for Booking Managers — availability, routing, reminders and the trip-page widget.',
  'https://cove.leatherbacktravel.com/booking',
  'Booking Operations',
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
  ('9b40cf1e-5f0a-4f5b-9a34-6d1f2fb0aa02', '7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01', 'user', 'Booking Manager', 'user', true, false),
  ('2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03', '7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01', 'admin', 'Pod Lead', 'admin', true, false)
on conflict (id) do update set
  application_id = excluded.application_id,
  role_key = excluded.role_key,
  name = excluded.name,
  access_level = excluded.access_level,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners;

insert into role_permissions (role_id, permission) values
  ('9b40cf1e-5f0a-4f5b-9a34-6d1f2fb0aa02', 'booking.open'),
  ('9b40cf1e-5f0a-4f5b-9a34-6d1f2fb0aa02', 'booking.read'),
  ('9b40cf1e-5f0a-4f5b-9a34-6d1f2fb0aa02', 'booking.manage_own'),
  ('2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03', 'booking.open'),
  ('2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03', 'booking.read'),
  ('2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03', 'booking.manage_own'),
  ('2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03', 'booking.manage')
on conflict do nothing;

-- Bootstrap: existing super admins become Pod Leads so the app is reachable
-- immediately after deploy. Everyone else is granted through Systems as usual.
insert into entitlements (application_id, role_id, subject_type, user_id, granted_by_user_id)
select distinct on (platform_role.user_id)
  '7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01',
  '2e7d95c8-13b6-4dd0-8c02-9adf4a71bb03',
  'user',
  platform_role.user_id,
  platform_role.granted_by_user_id
from user_platform_roles platform_role
where platform_role.role::text = 'super_admin'
  and platform_role.revoked_at is null
  and not exists (
    select 1 from entitlements entitlement
    where entitlement.application_id = '7c1a2f64-90b3-4e0d-8a11-5f6f0b6e9a01'
      and entitlement.user_id = platform_role.user_id
      and entitlement.revoked_at is null
  )
order by platform_role.user_id, platform_role.granted_at;

-- ---------------------------------------------------------------------------
-- Operational schema
-- ---------------------------------------------------------------------------

create schema if not exists booking;

create table booking.brand (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,
  name          text not null,
  -- Names this brand goes by in Airtable lookups ("Fencox Travel", "Carex Tours",
  -- "Magnificent Rail"). Matching happens on all of them so upstream renames
  -- never break routing.
  aliases       text[] not null default '{}',
  logo_url      text,
  color_primary text,
  color_accent  text,
  font_family   text,
  scheduling_timezone text not null,
  market        text not null check (market in ('AU', 'US')),
  phone_au      text,
  phone_nz      text,
  phone_default text,
  helpscout_mailbox_id text,
  from_email    text not null,
  from_name     text not null,
  reply_to      text,
  active        boolean not null default true
);

-- A brand can answer on more than one host (magnificentrail.com.au and
-- magnificentexplorers.com.au during the rename). Used for widget CORS and
-- for host-aware trip-slug resolution.
create table booking.brand_domain (
  brand_id uuid not null references booking.brand(id) on delete cascade,
  host     text not null,
  primary key (brand_id, host)
);

create table booking.staff (
  id                uuid primary key default gen_random_uuid(),
  email             citext unique not null,
  full_name         text not null,
  first_name        text not null,
  slug              citext unique not null,
  primary_brand_id  uuid references booking.brand(id),
  -- Null means: use the brand's scheduling timezone (the brand of the call
  -- being booked, which for multi-brand staff is not always the primary
  -- brand). Should stay null; exists for genuine exceptions only.
  timezone_override text,
  bio               text,
  photo_url         text,
  helpscout_user_id text,
  aircall_user_id   text,
  slack_user_id     text,
  airtable_record_id text,
  buffer_minutes    integer not null default 0 check (buffer_minutes between 0 and 120),
  -- Per-BM opt-outs for guest reminder emails, one per reminder moment.
  -- Confirmations, reschedules and cancellations always send.
  reminder_24h_enabled boolean not null default true,
  reminder_1h_enabled boolean not null default true,
  min_notice_hours  integer not null default 4 check (min_notice_hours between 0 and 336),
  booking_window_days integer not null default 28 check (booking_window_days between 1 and 365),
  active            boolean not null default true,
  calendar_ok       boolean not null default false,
  calendar_checked_at timestamptz,
  notion_page_id    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Membership, not identity: which brand pools a BM belongs to for routing and
-- backup ranking. (Jacqueline serves both Carex and Salt Caravan.)
create table booking.staff_brand (
  staff_id uuid not null references booking.staff(id) on delete cascade,
  brand_id uuid not null references booking.brand(id) on delete cascade,
  primary key (staff_id, brand_id)
);

-- Interpreted in the scheduling timezone of the brand whose call is being
-- booked (staff.timezone_override wins when set). 0 = Sunday.
create table booking.working_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references booking.staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_min   integer not null check (start_min between 0 and 1439),
  end_min     integer not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);

create index working_hours_staff_idx on booking.working_hours (staff_id);

create table booking.event_type (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references booking.brand(id),
  key            text not null,
  name           text not null,
  description    text,
  duration_min   integer not null check (duration_min between 5 and 240),
  guest_facing   boolean not null default false,
  supports_group boolean not null default false,
  location_kind  text not null default 'google_meet' check (location_kind in ('google_meet', 'phone')),
  active         boolean not null default true,
  position       integer not null default 0,
  unique (brand_id, key)
);

create table booking.event_type_staff (
  event_type_id uuid references booking.event_type(id) on delete cascade,
  staff_id      uuid references booking.staff(id) on delete cascade,
  primary key (event_type_id, staff_id)
);

create table booking.group_session (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references booking.staff(id),
  event_type_id   uuid not null references booking.event_type(id),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  capacity        integer not null check (capacity > 0),
  seats_taken     integer not null default 0 check (seats_taken >= 0),
  google_event_id text,
  meet_url        text,
  status          text not null default 'open' check (status in ('open', 'full', 'cancelled', 'held')),
  created_at      timestamptz not null default now(),
  check (seats_taken <= capacity),
  check (ends_at > starts_at)
);

create table booking.booking (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references booking.staff(id),
  brand_id          uuid not null references booking.brand(id),
  event_type_id     uuid not null references booking.event_type(id),
  group_session_id  uuid references booking.group_session(id),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  guest_timezone    text,
  guest_name        text not null,
  guest_email       citext not null,
  guest_phone       text,
  guest_notes       text,
  source_kind       text not null check (source_kind in ('trip', 'bm', 'contact', 'portal', 'invite', 'session')),
  source_slug       text,
  routed_via        text not null default 'primary' check (routed_via in ('primary', 'backup', 'pool')),
  routed_reason     text,
  airtable_trip_record_id text,
  google_event_id   text,
  google_ical_uid   text,
  meet_url          text,
  manage_token_hash bytea not null,
  -- RFC 5545 SEQUENCE for the guest's .ics; bumped on every reschedule and on
  -- cancellation so calendar clients apply updates to the same UID.
  ical_sequence     integer not null default 0,
  status            text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'rescheduled')),
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,
  idempotency_key   text unique,
  helpscout_conversation_id text,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  rescheduled_at    timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      text check (cancelled_by in ('guest', 'bm', 'system')),
  check (ends_at > starts_at)
);

-- THE most important constraint in the system. Postgres refuses to
-- double-book a Booking Manager; application code only makes the failure
-- friendly. Group-session seats intentionally share a time slot.
alter table booking.booking add constraint booking_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'confirmed' and group_session_id is null);

create index booking_reminder_idx
  on booking.booking (starts_at) where status = 'confirmed';
create index booking_staff_time_idx on booking.booking (staff_id, starts_at);
create index booking_manage_token_idx on booking.booking (manage_token_hash);

create table booking.slot_hold (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references booking.staff(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  expires_at timestamptz not null
);

create index slot_hold_expiry_idx on booking.slot_hold (expires_at);
create index slot_hold_staff_idx on booking.slot_hold (staff_id, starts_at);

create table booking.bm_invitation (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references booking.staff(id),
  event_type_id uuid not null references booking.event_type(id),
  guest_name    text,
  guest_email   citext,
  candidates    jsonb not null,
  token_hash    bytea not null,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'expired')),
  booking_id    uuid references booking.booking(id),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index bm_invitation_token_idx on booking.bm_invitation (token_hash);

create table booking.message_template (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references booking.brand(id),
  event_type_key text,
  moment        text not null check (moment in ('confirmation', 'reminder_24h', 'reminder_1h', 'cancellation', 'reschedule', 'followup')),
  subject       text not null,
  body_html     text not null,
  active        boolean not null default true,
  updated_by    text,
  updated_at    timestamptz not null default now()
);

-- Resolution: most specific wins — (brand, type) > (brand, null) > (null, null).
create unique index message_template_scope_idx
  on booking.message_template (moment, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(event_type_key, ''))
  where active;

create table booking.reference_cache (
  key         text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null,
  etag        text
);

create table booking.coverage_issue (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  severity    text not null check (severity in ('error', 'warning', 'info')),
  subject_ref text not null,
  message     text not null,
  detail      jsonb,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved_at timestamptz,
  unique (kind, subject_ref)
);

create table booking.audit_log (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,
  subject    text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- Debounce ledger for Slack alerts: one message per issue per hour.
create table booking.alert_sent (
  key     text primary key,
  sent_at timestamptz not null default now()
);

-- Fixed-window rate limiting for the public endpoints (10 req/min/IP,
-- 3 bookings/hour/email). One row per (kind, principal); the window resets
-- in-place so the table stays tiny.
create table booking.rate_limit (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Seed: the seven booking brands. Scheduling timezones anchor to the market
-- the brand sells into, NOT where any BM lives (decided; see build brief §5.1a).
-- Help Scout mailbox ids verified against the live account on 2026-08-17.
-- from_email values are placeholders until Resend sender domains are verified
-- (open item #10) — the notifier stays in stub mode until then.
-- ---------------------------------------------------------------------------

insert into booking.brand (id, key, name, aliases, scheduling_timezone, market, helpscout_mailbox_id, from_email, from_name, phone_default) values
  ('b1000000-0000-4000-8000-000000000001', 'patch', 'Patch Adventures', array['Patch Adventures'], 'Australia/Melbourne', 'AU', '281761', 'bookings@patchadventures.com.au', 'Patch Adventures', null),
  ('b1000000-0000-4000-8000-000000000002', 'camino-women', 'Camino Women', array['Camino Women'], 'Australia/Melbourne', 'AU', '293574', 'bookings@caminowomen.com.au', 'Camino Women', null),
  ('b1000000-0000-4000-8000-000000000003', 'magnificent-explorers', 'Magnificent Explorers', array['Magnificent Explorers', 'Magnificent Rail'], 'Australia/Melbourne', 'AU', '288706', 'bookings@magnificentexplorers.com.au', 'Magnificent Explorers', null),
  ('b1000000-0000-4000-8000-000000000004', 'fencox', 'Fencox', array['Fencox', 'Fencox Travel'], 'Australia/Melbourne', 'AU', '310122', 'bookings@fencox.com.au', 'Fencox', null),
  ('b1000000-0000-4000-8000-000000000005', 'carex', 'Carex Garden Tours', array['Carex', 'Carex Tours', 'Carex Garden Tours'], 'America/Los_Angeles', 'US', '334973', 'bookings@carexdesign.com', 'Carex Garden Tours', null),
  ('b1000000-0000-4000-8000-000000000006', 'salt-caravan', 'Salt Caravan', array['Salt Caravan'], 'America/Los_Angeles', 'US', '351173', 'bookings@saltcaravan.com', 'Salt Caravan', null),
  ('b1000000-0000-4000-8000-000000000007', 'harriet', 'Harriet Adventures', array['Harriet Adventures'], 'America/Los_Angeles', 'US', '359421', 'bookings@harrietadventures.com', 'Harriet Adventures', null)
on conflict (id) do update set
  name = excluded.name,
  aliases = excluded.aliases,
  scheduling_timezone = excluded.scheduling_timezone,
  market = excluded.market,
  helpscout_mailbox_id = excluded.helpscout_mailbox_id;

insert into booking.brand_domain (brand_id, host) values
  ('b1000000-0000-4000-8000-000000000001', 'patchadventures.com.au'),
  ('b1000000-0000-4000-8000-000000000002', 'caminowomen.com.au'),
  ('b1000000-0000-4000-8000-000000000003', 'magnificentexplorers.com.au'),
  ('b1000000-0000-4000-8000-000000000003', 'magnificentrail.com.au'),
  ('b1000000-0000-4000-8000-000000000004', 'fencox.com.au'),
  ('b1000000-0000-4000-8000-000000000005', 'carexdesign.com'),
  ('b1000000-0000-4000-8000-000000000006', 'saltcaravan.com'),
  ('b1000000-0000-4000-8000-000000000006', 'saltcaravan.wetravel.com'),
  ('b1000000-0000-4000-8000-000000000007', 'harrietadventures.com')
on conflict do nothing;

-- Seed the five call types for every brand, using the team's real names and
-- the decided durations. RHIME is guest-bookable by decision (§9.1); Pre-Trip
-- stays BM-initiated.
insert into booking.event_type (brand_id, key, name, description, duration_min, guest_facing, supports_group, position)
select b.id, t.key, t.name, t.description, t.duration_min, t.guest_facing, t.supports_group, t.position
from booking.brand b
cross join (values
  ('enquiry',  'Trip Enquiry',  'A chat about where you want to go, for guests not yet tied to a departure.', 30, true,  false, 0),
  ('rhime',    'RHIME Call',    'The qualifying call: Relationship, Health, Information, Match, Expectations.', 30, true,  false, 1),
  ('lead-up',  'Lead-Up Call',  'Pre-departure check-in in the lead-up to your trip.', 20, true,  true,  2),
  ('pre-trip', 'Pre-Trip Call', 'A quick call shortly before departure.', 15, false, true,  3),
  ('feedback', 'Feedback Call', 'How was your trip? Most take 15-20 minutes; we allow 30.', 30, true,  false, 4)
) as t(key, name, description, duration_min, guest_facing, supports_group, position)
on conflict (brand_id, key) do nothing;
