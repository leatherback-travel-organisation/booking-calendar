-- Mutation idempotency and optimistic concurrency primitives used by the
-- application service. Safe to apply after the base schema.

create table mutation_keys (
  key text primary key,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index mutation_keys_expiry on mutation_keys (expires_at);
create index user_invitations_email_history on user_invitations (lower(email), invited_at desc);
create index identities_user_lookup on identities (user_id);
create index users_status_lookup on users (status, updated_at desc);
