-- Overlap awareness (Nicola, 1 Sep 2026): when every involved team member is
-- demonstrably already aware two projects interact (usually established from
-- Slack history), the crossover stops raising attention notifications for
-- anyone. The overlap itself stays visible on the project cards and in the
-- drawer, tagged with why it went quiet — the information is kept, only the
-- noise goes.

create table garden.overlap_awareness (
  project_a uuid not null references garden.projects(id) on delete cascade,
  project_b uuid not null references garden.projects(id) on delete cascade,
  source text not null default 'slack',
  note text check (note is null or char_length(note) <= 400),
  noted_at timestamptz not null default now(),
  primary key (project_a, project_b),
  constraint garden_awareness_pair_order check (project_a < project_b)
);
