-- App Builder publishes checked drafts automatically and retains an exact,
-- auditable reversal path for App Builder administrators.

alter table app_builder_requests
  drop constraint app_builder_requests_status_check;

alter table app_builder_requests
  add constraint app_builder_requests_status_check check (status in (
    'queued', 'reading', 'waiting_openai', 'making_changes',
    'preparing_review', 'needs_approval', 'publishing', 'live',
    'reversing', 'reversed', 'failed'
  )),
  add column published_commit_sha text,
  add column reversal_pull_number integer,
  add column reversal_pull_url text,
  add column reversed_commit_sha text,
  add column reversed_by_user_id uuid references users(id) on delete restrict,
  add column reversed_at timestamptz,
  add constraint app_builder_published_commit check (
    published_commit_sha is null or published_commit_sha ~ '^[0-9a-f]{40,64}$'
  ),
  add constraint app_builder_reversed_commit check (
    reversed_commit_sha is null or reversed_commit_sha ~ '^[0-9a-f]{40,64}$'
  );

drop index app_builder_requests_one_active_per_app;
create unique index app_builder_requests_one_active_per_app
  on app_builder_requests(target_asset_id)
  where status in (
    'reading', 'waiting_openai', 'making_changes', 'preparing_review',
    'publishing', 'reversing'
  );
