-- Phase 1 keeps recruiter-only workflow metadata in Cove. Candidate records and
-- stages remain in Airtable; email templates are drafts and default to disabled.

create table recruitment_candidate_tags (
  candidate_record_id text not null check (candidate_record_id ~ '^rec[A-Za-z0-9]+$'),
  tag text not null check (length(tag) between 1 and 80),
  updated_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (candidate_record_id, tag)
);

create index recruitment_candidate_tags_candidate
  on recruitment_candidate_tags (candidate_record_id);

create table recruitment_email_templates (
  template_key text primary key check (template_key in ('interview', 'challenge', 'reference-checks', 'talent-pool', 'general-rejection')),
  stage text not null,
  subject text not null check (length(subject) between 2 and 240),
  body text not null check (length(body) between 20 and 12000),
  enabled boolean not null default false,
  updated_by_user_id uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update applications
set launch_url = 'https://cove.leatherbacktravel.com/recruitment'
where slug = 'recruitment';
