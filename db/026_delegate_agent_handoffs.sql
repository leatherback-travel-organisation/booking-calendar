create table if not exists delegate_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  delegate_email text not null unique,
  delegate_name text not null,
  session_token_hash text not null unique,
  state text not null default 'awaiting_codex'
    check (state in ('awaiting_codex', 'awaiting_delegate', 'access_ready', 'blocked')),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  constraint delegate_agent_sessions_email check (
    delegate_email in ('nevena@leatherbacktravel.com', 'csilla@leatherbacktravel.com')
  ),
  constraint delegate_agent_sessions_name check (char_length(delegate_name) between 2 and 120),
  constraint delegate_agent_sessions_token check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint delegate_agent_sessions_expiry check (expires_at > activated_at)
);

create table if not exists delegate_agent_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references delegate_agent_sessions(id) on delete cascade,
  direction text not null check (direction in ('delegate_to_codex', 'codex_to_delegate')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  constraint delegate_agent_messages_handled check (
    handled_at is null or direction = 'delegate_to_codex'
  )
);

create index if not exists delegate_agent_messages_pending_idx
  on delegate_agent_messages(created_at)
  where direction = 'delegate_to_codex' and handled_at is null;

create index if not exists delegate_agent_messages_session_idx
  on delegate_agent_messages(session_id, id);
