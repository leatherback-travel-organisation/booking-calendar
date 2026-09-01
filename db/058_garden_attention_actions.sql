-- Attention-item actions (Nicola, 1 Sep 2026): "Noted" dismissals are
-- per-person and permanent for that item; Slack notifications are logged so
-- the UI can say when a team was last pinged.

create table garden.attention_dismissals (
  person_key text not null,
  item_key text not null check (char_length(item_key) between 1 and 200),
  dismissed_at timestamptz not null default now(),
  primary key (person_key, item_key)
);

create table garden.attention_notifications (
  id uuid primary key default gen_random_uuid(),
  item_key text not null check (char_length(item_key) between 1 and 200),
  sent_by text not null,
  sent_at timestamptz not null default now(),
  channel text not null default 'slack'
);

create index garden_attention_notifications_item_idx
  on garden.attention_notifications (item_key, sent_at desc);
