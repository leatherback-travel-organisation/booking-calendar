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
  -- Guests whose booking has a phone number also get SMS reminders when the
  -- brand opts in (toggled by Pod Leads/SBMs in Guest Communications).
  sms_reminders_enabled boolean not null default false,
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
  -- Synced from Notion; "Senior Booking Manager" grants Guest Communications
  -- editing (with Pod Leads) — no per-person toggle to maintain.
  job_title         text,
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
  -- How the guest asked to take the call. Video creates a Meet link on the
  -- calendar event; phone skips it and the BM rings the guest instead.
  call_medium       text not null default 'video' check (call_medium in ('video', 'phone')),
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

-- color_primary comes from each brand's live site (dominant logo/button
-- colour); Salt Caravan's plum is from its landing-page build.
insert into booking.brand (id, key, name, aliases, scheduling_timezone, market, helpscout_mailbox_id, from_email, from_name, phone_default, color_primary) values
  ('b1000000-0000-4000-8000-000000000001', 'patch', 'Patch Adventures', array['Patch Adventures'], 'Australia/Melbourne', 'AU', '281761', 'bookings@patchadventures.com.au', 'Patch Adventures', null, '#ad5046'),
  ('b1000000-0000-4000-8000-000000000002', 'camino-women', 'Camino Women', array['Camino Women'], 'Australia/Melbourne', 'AU', '293574', 'bookings@caminowomen.com.au', 'Camino Women', null, '#295244'),
  ('b1000000-0000-4000-8000-000000000003', 'magnificent-explorers', 'Magnificent Explorers', array['Magnificent Explorers', 'Magnificent Rail'], 'Australia/Melbourne', 'AU', '288706', 'bookings@magnificentexplorers.com.au', 'Magnificent Explorers', null, '#1d283b'),
  ('b1000000-0000-4000-8000-000000000004', 'fencox', 'Fencox', array['Fencox', 'Fencox Travel'], 'Australia/Melbourne', 'AU', '310122', 'bookings@fencox.com.au', 'Fencox', null, '#004c7a'),
  ('b1000000-0000-4000-8000-000000000005', 'carex', 'Carex Garden Tours', array['Carex', 'Carex Tours', 'Carex Garden Tours'], 'America/Los_Angeles', 'US', '334973', 'bookings@carexdesign.com', 'Carex Garden Tours', null, '#005857'),
  ('b1000000-0000-4000-8000-000000000006', 'salt-caravan', 'Salt Caravan', array['Salt Caravan'], 'America/Los_Angeles', 'US', '351173', 'bookings@saltcaravan.com', 'Salt Caravan', null, '#7a3163'),
  ('b1000000-0000-4000-8000-000000000007', 'harriet', 'Harriet Adventures', array['Harriet Adventures'], 'America/Los_Angeles', 'US', '359421', 'bookings@harrietadventures.com', 'Harriet Adventures', null, '#e0594f')
on conflict (id) do update set
  name = excluded.name,
  aliases = excluded.aliases,
  scheduling_timezone = excluded.scheduling_timezone,
  market = excluded.market,
  helpscout_mailbox_id = excluded.helpscout_mailbox_id,
  color_primary = excluded.color_primary;

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

-- Group sessions are Carex-only (decision 19 Aug): the Lead-Up group call is
-- retired, replaced by an hour-long Carex pre-trip video call. Lead-up stays
-- a 1:1 call type; every other brand's pre-trip stays BM-initiated 1:1.
update booking.event_type set supports_group = false where key = 'lead-up';
update booking.event_type set supports_group = false
  where key = 'pre-trip'
    and brand_id <> (select id from booking.brand where key = 'carex');
update booking.event_type
   set name = 'Pre-Trip Video Call',
       description = 'An hour together on video before you travel — the full pre-trip run-through.',
       duration_min = 60,
       location_kind = 'google_meet'
 where key = 'pre-trip'
   and brand_id = (select id from booking.brand where key = 'carex');

-- Per-brand voiced templates (Special Feeling, one voice per brand —
-- Patch adventurous, Camino encouraging, Magnificent rail-elegant, Fencox
-- grounded, Carex botanical, Salt Caravan lyrical, Harriet spirited).
-- do nothing on conflict: never clobber an edited template.
insert into booking.message_template (brand_id, event_type_key, moment, subject, body_html, active, updated_by) values
  ((select id from booking.brand where key = 'patch'), null, 'confirmation',
   'Adventure incoming, {{guest.first_name}} — you''re booked with {{host.first_name}}!',
   '<p>Hi {{guest.first_name}},</p><p>Brilliant — your chat with {{host.first_name}} is locked in, and the planning fun starts here! 🎒</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Bring your questions and your big ideas — we''ll bring the know-how.</p><p>Adventure awaits,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'patch'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Tomorrow you''re talking adventure with {{host.first_name}} — <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>Adventure awaits,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'patch'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>Grab a cuppa and your wish list. {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'patch'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>No hard feelings at all — adventures keep. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'patch'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Easy done — your call has a shiny new time. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>Adventure awaits,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'camino-women'), null, 'confirmation',
   'You''re booked, {{guest.first_name}} — a lovely first step',
   '<p>Hi {{guest.first_name}},</p><p>Wonderful — your chat with {{host.first_name}} is in the diary. Every great walk starts with a step like this. 🥾</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Come with your questions — big or small, they all matter.</p><p>Warmly,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'camino-women'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Tomorrow you and {{host.first_name}} take the first steps on your plans — <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>Warmly,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'camino-women'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>Pop the kettle on and settle in. {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'camino-women'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>Whenever you''re ready to lace up again, we''re right here. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'camino-women'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>All rearranged — same lovely chat, new time. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>Warmly,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'magnificent-explorers'), null, 'confirmation',
   'Right on schedule: your call with {{host.first_name}}, {{guest.first_name}}',
   '<p>Hi {{guest.first_name}},</p><p>Splendid — your conversation with {{host.first_name}} is on the timetable. 🚂</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Bring your questions — {{host.first_name}} knows these journeys down to the clickety-clack.</p><p>Until then,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'magnificent-explorers'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Tomorrow, right on time, you''re speaking with {{host.first_name}} — <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>Until then,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'magnificent-explorers'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>Departure is close — settle in somewhere comfortable. {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'magnificent-explorers'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>Timetables change; ours flexes with you. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'magnificent-explorers'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Timetable updated — you''re on the new departure. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>Until then,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'fencox'), null, 'confirmation',
   'Done and dusted, {{guest.first_name}} — you''re booked with {{host.first_name}}',
   '<p>Hi {{guest.first_name}},</p><p>Good news — your chat with {{host.first_name}} is booked and sorted.</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Come as you are and ask anything — straight answers, promise.</p><p>Cheers,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'fencox'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Quick one — you''re talking with {{host.first_name}} tomorrow, <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>Cheers,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'fencox'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>Nearly time — grab a comfortable seat. {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'fencox'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>No fuss, no forms — just book again whenever it suits. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'fencox'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Sorted — your call has a new time. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>Cheers,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'carex'), null, 'confirmation',
   'Something lovely is planted, {{guest.first_name}} — your call with {{host.first_name}}',
   '<p>Hi {{guest.first_name}},</p><p>How lovely — your chat with {{host.first_name}} is planted in the calendar. 🌿</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Bring your garden wish list — the rambling kind is our favourite.</p><p>Green regards,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'carex'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Tomorrow you and {{host.first_name}} talk gardens — <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>Green regards,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'carex'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>Nearly time — pour something nice and find a sunny spot. {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'carex'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>Gardens keep, and so do we — book again any time. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'carex'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Repotted! Your call has a new time. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>Green regards,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'salt-caravan'), null, 'confirmation',
   'It''s in the book, {{guest.first_name}} — you and {{host.first_name}}',
   '<p>Hi {{guest.first_name}},</p><p>Lovely — your conversation with {{host.first_name}} has a page in the diary. ✨</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Bring the places you can''t stop thinking about.</p><p>Until soon,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'salt-caravan'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Tomorrow you and {{host.first_name}} talk about where next — <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>Until soon,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'salt-caravan'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>Almost time — find your favourite corner. {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'salt-caravan'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>Some plans drift; the good ones circle back. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'salt-caravan'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>The plan has wandered to a new time — all set. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>Until soon,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'harriet'), null, 'confirmation',
   'Yes! You''re booked, {{guest.first_name}} — {{host.first_name}} can''t wait',
   '<p>Hi {{guest.first_name}},</p><p>Yes! Your call with {{host.first_name}} is officially happening. 🎉</p><p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we''ve set aside {{booking.duration}} just for you.</p><p>{{booking.join_details}}</p><p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p><p>Bring all your questions — the wilder the better.</p><p>High fives,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'harriet'), null, 'reminder_24h',
   'Tomorrow''s the day — your call with {{host.first_name}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Tomorrow''s the day — you and {{host.first_name}}! <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p><p>High fives,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'harriet'), null, 'reminder_1h',
   'Nearly time! Your call with {{host.first_name}} starts at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Nearly time! You and {{host.first_name}} are talking at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p><p>It''s nearly go time! {{booking.join_details}}</p><p>See you very soon!</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'harriet'), null, 'cancellation',
   'Your call on {{booking.meeting_date}} has been cancelled',
   '<p>Hi {{guest.first_name}},</p><p>Your call with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p><p>Totally fine — the adventure will keep. We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p><p>Hope we get to talk soon,<br/>The {{brand.name}} team</p>', true, 'seed:brand-voice'),
  ((select id from booking.brand where key = 'harriet'), null, 'reschedule',
   'All sorted — new time locked in: {{booking.meeting_date}} at {{booking.meeting_time}}',
   '<p>Hi {{guest.first_name}},</p><p>Boom — new time locked in. You and {{host.first_name}} are now talking on <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p><p>{{booking.join_details}}</p><p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p><p>High fives,<br/>{{host.first_name}} at {{brand.name}}</p>', true, 'seed:brand-voice')
on conflict do nothing;
