-- One-time invitation codes for the Cove "Build an app" workflow.
--
-- A systems operator generates a code in SuperPanel and hands it to one
-- person; redeeming it is what will unlock the guided app-building flow. Only
-- the SHA-256 hash of a code is stored — the plain code is shown once at
-- generation and never persisted, keeping reusable secrets out of this
-- database. Codes expire, are single-use, and can be revoked before use.

create table if not exists app_builder_codes (
  id                  uuid primary key default gen_random_uuid(),
  code_hash           text unique not null,
  label               text not null,
  created_by_user_id  uuid not null references users(id),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  redeemed_at         timestamptz,
  redeemed_by_user_id uuid references users(id),
  revoked_at          timestamptz,
  revoked_by_user_id  uuid references users(id),
  constraint app_builder_codes_label_length check (char_length(label) between 1 and 120)
);

create index if not exists app_builder_codes_created_idx
  on app_builder_codes (created_at desc);
