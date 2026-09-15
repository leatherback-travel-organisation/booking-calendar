-- Seed The Garden with the normalised Gardening project list supplied by
-- Nicola on 31 Aug 2026 (people resolved against the Notion team directory the
-- same day). Generated from src/lib/garden/seed-data.ts — regenerate rather
-- than editing by hand. Idempotent per project id: existing rows are never
-- touched, so re-running cannot clobber later edits.

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000001', 'Guest Portal', 'Give guests one portal for their trip details, documents and pre-departure steps.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Testing or roll out', '2026-10-15',
  array['Booking Managers']::text[], array['Stacker', 'Airtable - Leatherback Bookings and Data base']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, array['Booking Managers']::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'systems', 'testingTeams']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000002', 'TRTL - Stacker replacement', 'Replace Stacker with our own Turtle platform before the licence renews.',
  '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-11-30',
  array['Booking Managers', 'Operations']::text[], array['Stacker']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000003', 'Online Booking Portal', 'Let guests book online end-to-end without emailing a Booking Manager.',
  '{"id":null,"name":"Tsvetan Antonov","email":"tsvetan@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Cancelled or replaced', null,
  array['Operations', 'Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, '', 'Functionality incorporated into Guest Portal.',
  '[]'::jsonb, '{}'::text[], array['00000000-0000-4000-8000-000000000001']::uuid[], array['purpose', 'growthStage', 'cancellationReason']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:45:00Z',
  null, '2026-08-24T11:45:00Z', null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000004', 'Today - BM Dashboard', 'Give Booking Managers one morning view of calls, departures and flags.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Testing or roll out', '2026-09-30',
  array['Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, array['Booking Managers']::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'testingTeams']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000005', 'CallTime - BM Call Scheduling App', 'Replace Calendly with our own call scheduling inside Cove.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-10-31',
  array['Booking Managers']::text[], array['Aircall']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000006', 'Exploring Web Design Capabilities', 'Learn what we can build in-house before committing to agency work.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Cancelled or replaced', null,
  '{}'::text[], '{}'::text[], '{}'::text[],
  null, null, '', 'Exploration complete — learnings folded into the brand website projects.',
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'cancellationReason']::text[],
  '2026-06-01T10:00:00Z', '2026-07-06T10:00:00Z', '2026-07-06T10:00:00Z',
  null, '2026-07-06T10:00:00Z', '2026-08-06T10:00:00Z'
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000007', 'Automations', 'Round up the automations running across our systems.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'Cancelled or replaced', null,
  '{}'::text[], '{}'::text[], '{}'::text[],
  null, null, '', 'Superseded by the Automations Index project.',
  '[]'::jsonb, '{}'::text[], array['00000000-0000-4000-8000-000000000015']::uuid[], array['purpose', 'cancellationReason']::text[],
  '2026-06-01T10:00:00Z', '2026-07-13T10:00:00Z', '2026-07-13T10:00:00Z',
  null, '2026-07-13T10:00:00Z', '2026-08-13T10:00:00Z'
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000008', 'The Helm - Pod Lead Dashboard', 'Give pod leads a single dashboard of their pod''s numbers.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, null, '[]'::jsonb,
  'Cancelled or replaced', null,
  '{}'::text[], '{}'::text[], '{}'::text[],
  null, null, '', 'Replaced by the Pod Lead Dashboards / Databox work.',
  '[]'::jsonb, '{}'::text[], array['00000000-0000-4000-8000-000000000021']::uuid[], array['purpose', 'cancellationReason']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:50:00Z',
  null, '2026-08-24T11:50:00Z', null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000009', 'New Supplier Portal', 'Build suppliers a portal for availability, rates and trip information.',
  '{"id":null,"name":"Radina Petrishka","email":"radina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-12-15',
  array['DMC']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000010', 'Nest - TD Airtable replacement', 'Move Trip Design off its overloaded Airtable base and into Nest.',
  '{"id":null,"name":"Jamie Hathaway","email":"jamie@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-11-15',
  array['Trip Design']::text[], array['Airtable - Trip Design base']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000011', 'Toucan - Flamingo replacement', 'Replace Flamingo with our own team portal.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Active work', '2026-10-31',
  array['HR & Hiring']::text[], array['Flamingo']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000012', 'Octomancer', 'Automate our multi-channel content publishing tentacles.',
  '{"id":null,"name":"Dijana Blagojevic","email":"dijana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'teams']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000013', 'HelpScout Side Panel', 'Show booking context beside every HelpScout conversation.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-09-30',
  array['Booking Managers', 'Operations']::text[], array['HelpScout - Adventure Brands']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000014', 'Trip Coord Pod Interface Replacement', 'Rebuild the Trip Coordination pod''s day-to-day interface.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Booking Managers', 'Operations']::text[], array['Airtable - Daily Operations base']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000015', 'Automations Index', 'Keep one searchable index of every automation we run.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  '{}'::text[], array['Zapier']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000016', 'Brand Pod Interface Replacement', 'Rebuild the Brand pod''s working interface.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  '{}'::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000017', 'Invoice Generator', 'Generate trip invoices automatically instead of by hand.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Booking Managers', 'Operations']::text[], array['Xero']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000018', 'Guide training course', 'Build a training course for new trip guides.',
  '{"id":null,"name":"Lisa O''Donnell","email":"lisa@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-05-10T10:00:00Z', '2026-05-10T10:00:00Z', '2026-05-10T10:00:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000019', 'Pricing Process', 'Standardise how trips are priced and reviewed.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, 'Working doc lives in Airtable.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000020', 'Debut Trips', 'Smooth the path from a new trip idea to its first departure.',
  '{"id":null,"name":"Lisa O''Donnell","email":"lisa@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-08-15',
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion']::text[],
  '2026-06-15T10:00:00Z', '2026-07-20T10:00:00Z', '2026-07-20T10:00:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000021', 'Pod Lead Dashboards / Databox', 'Give pod leads live numbers through Databox dashboards.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Active work', null,
  array['Finance']::text[], array['Databox']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000022', 'Brianna''s risk and ops work / incident management', 'Integrate risk assessment and incident management into daily operations.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000023', 'Survey our suppliers', 'Ask suppliers how working with us could be smoother.',
  '{"id":null,"name":"Jamie Hathaway","email":"jamie@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000024', 'Distribute the unicorn prizes', 'Get the unicorn prizes into winners'' hands.',
  '{"id":null,"name":"Lisa O''Donnell","email":"lisa@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Complete', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-20T10:00:00Z', '2026-08-20T10:00:00Z',
  '2026-08-20T10:00:00Z', null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000025', 'Hotel night management - Portal & AI', 'Manage extra hotel nights through the portal with AI assistance.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000026', 'Flag guests emailing within 72 hrs of trip start', 'Route imminent-departure guest emails straight into Trip Help.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-09-15',
  array['Operations']::text[], array['HelpScout - Adventure Brands', 'Slack Workspace - Leatherback Travel']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'estimatedCompletion', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000027', 'Check nationality against visa requirements', 'Catch visa problems before guests reach the airport.',
  '{"id":null,"name":"Danko Cimbaljević","email":"danko@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000028', 'AI: Meet your trip mate in the portal', 'Introduce guests to their trip mates inside the portal.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000029', 'Guest refund revamp', 'Make guest refunds faster and less manual.',
  '{"id":null,"name":"Danko Cimbaljević","email":"danko@leatherbacktravel.com"}'::jsonb, null, '[{"id":null,"name":"Pippa Chisholm","email":"pippa@caminowomen.com.au"}]'::jsonb,
  'In Planning', null,
  array['Operations', 'Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000030', 'Picking up more BM email', 'Shift more Booking Manager email into shared handling.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}]'::jsonb,
  'Active work', null,
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, 'https://patchadventures.slack.com/docs/T03S41T12NP/F0BJ2SL35UL', '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000031', 'FILL RATES - advanced modelling', 'Model fill rates by cohort and develop the metrics behind them.',
  '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Finance']::text[], '{}'::text[], '{}'::text[],
  'Gnarly Oozes', null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000032', 'Financial Control - Salemi and Garrigue integration', 'Bring Salemi and Garrigue fully into our financial controls.',
  '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Finance']::text[], array['Xero']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000033', 'FILL RATES - AI generated marketing segments', 'Turn fill-rate data into AI-generated marketing segments.',
  '{"id":null,"name":"Katarina Stanković","email":"katarina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  'Gnarly Oozes', null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000034', 'Mailvio rollout - migrate other brands onto Mailvio', 'Move remaining brands onto Mailvio and standardise email marketing.',
  '{"id":null,"name":"Katarina Stanković","email":"katarina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-10-31',
  array['Marketing']::text[], array['Mailvio']::text[], array['Camino Women', 'Fencox Travel', 'Carex Garden Tours']::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'brands']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000035', 'Rollout Trip Highlights improvement', 'Roll the improved Trip Highlights format out across brands.',
  '{"id":null,"name":"Dijana Blagojevic","email":"dijana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000036', 'Magex website refresh', 'Refresh the Magnificent Explorers website.',
  '{"id":null,"name":"Katarina Stanković","email":"katarina@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], array['Magnificent Explorers']::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'brands']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000037', 'Fencox brand refresh', 'Refresh the Fencox Travel brand identity.',
  '{"id":null,"name":"Dijana Blagojevic","email":"dijana@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '[]'::jsonb,
  'Active work', '2026-11-30',
  array['Marketing']::text[], array['Webflow']::text[], array['Fencox Travel']::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage', 'estimatedCompletion', 'systems', 'brands']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000038', 'PR firm onboarding', 'Bring the new PR firm up to speed on our brands.',
  '{"id":null,"name":"Katarina Stanković","email":"katarina@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000039', 'Leatherback DMC Pages', 'Publish pages presenting our DMC capabilities.',
  '{"id":null,"name":"Radina Petrishka","email":"radina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000040', 'Leatherback Digital PR - Trackability and Targeting', 'Make digital PR spend trackable and better targeted.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000041', 'AI: DMC Systems starts to build them V1', 'Start building the DMC''s core systems with AI assistance.',
  '{"id":null,"name":"Radina Petrishka","email":"radina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['DMC']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000042', 'Local Moments - Design and Manage', 'Design and manage the Local Moments experiences.',
  '{"id":null,"name":"Radina Petrishka","email":"radina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['DMC']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000043', 'Team ENPS score', 'Measure and track team ENPS regularly.',
  '{"id":null,"name":"Dee Urosevic","email":"dee@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}]'::jsonb,
  'Active work', null,
  array['HR & Hiring']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000044', 'ToG', 'Shape the ToG programme and get it moving.',
  '{"id":null,"name":"Pippa Chisholm","email":"pippa@caminowomen.com.au"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Sophie Stansfield","email":"sophie@caminowomen.com.au"}]'::jsonb,
  'In Planning', null,
  array['Leadership']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'teams']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000045', 'Extensions', 'Standardise how trip extensions are quoted, booked and communicated.',
  '{"id":null,"name":"Tegan Weekley","email":"tegan@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Mandy Scanlon","email":"mandy@patchadventures.com.au"},{"id":null,"name":"Farrah Passmore","email":"farrah@patchadventures.com.au"}]'::jsonb,
  'Active work', null,
  array['Operations', 'Booking Managers']::text[], array['Stacker', 'Payment Code and FAQ Extractor']::text[], '{}'::text[],
  null, null, 'SOP/info page; what info is in Stacker; sending res emails using the FAQ extractor; getting deposit amounts.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000046', 'Saved Replies/Notion refresh', 'Move saved replies to where each team actually works.',
  '{"id":null,"name":"Sophie Stansfield","email":"sophie@caminowomen.com.au"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Active work', null,
  array['Operations', 'Booking Managers']::text[], array['Notion - Leatherback Travel', 'HelpScout - Adventure Brands']::text[], '{}'::text[],
  null, null, 'Move less-used BM saved replies to Notion (meatballs); move common ops replies to HelpScout.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000047', 'Trip Summaries', 'Move trip summaries from Notion into Stacker.',
  '{"id":null,"name":"Janie Welsh","email":"janie@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"},{"id":null,"name":"Claire Jakobi","email":"claire@patchadventures.com.au"}]'::jsonb,
  'Active work', '2026-11-15',
  array['Booking Managers']::text[], array['Notion - Leatherback Travel', 'Stacker']::text[], '{}'::text[],
  null, null, 'Trip Summaries Notion → Stacker.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000048', 'Booking Cutoff Process', 'Set one clear booking cutoff process across brands.',
  '{"id":null,"name":"Claire Jakobi","email":"claire@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'In Planning', null,
  array['Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000049', 'Optimising call summaries', 'Improve call summaries towards hands-off activity feeds.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Jacqueline Lancaster","email":"jacqueline@carexdesign.com"}]'::jsonb,
  'Active work', null,
  array['Booking Managers']::text[], array['Aircall']::text[], '{}'::text[],
  null, null, 'Long-term aim: a hands-off automation maintaining activity feeds.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'teams', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000050', 'Lead tidy-up', 'Tidy the lead pipeline before the 2027 season.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}]'::jsonb,
  'Active work', null,
  array['Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, 'Lead Tidy-Up Project 2026.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'teams']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000051', 'New Process Rollouts', 'Give every new process a consistent rollout path.',
  '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Active work', null,
  array['Leadership']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000052', 'TD technical support and CI', 'Give Trip Design steady technical support and continuous improvement.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Trip Design']::text[], array['HelpScout - Trip Design']::text[], '{}'::text[],
  null, null, 'HelpScout inboxes; trip invoices and comms; tidying the AT base; proofreading workflow.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000053', 'Channel triage bot', 'Triage busy channels so the right people see the right messages.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Ivana Strihic Dojcinovski","email":"ivana@leatherbacktravel.com"}]'::jsonb,
  'Active work', '2026-09-30',
  array['Operations']::text[], array['Slack Workspace - Leatherback Travel']::text[], '{}'::text[],
  null, null, 'Ops notifications; BM notifications; ask system.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000054', 'AT Naming Configuration', 'Agree one naming configuration across our Airtable bases.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, null, '[{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}]'::jsonb,
  'In Planning', null,
  array['Operations']::text[], array['Airtable - Daily Operations base']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'teams', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000055', 'Fit to Explore - Fit and Fitness customer journey review', 'Review how fitness expectations flow through the whole guest journey.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '[]'::jsonb,
  'In Planning', null,
  array['Operations', 'Trip Design', 'Booking Managers', 'Marketing']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000056', 'Fencox new website', 'Build the new Fencox Travel website.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '[]'::jsonb,
  'Active work', '2026-12-15',
  array['Marketing']::text[], array['Webflow']::text[], array['Fencox Travel']::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'estimatedCompletion', 'teams', 'systems', 'brands']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000057', 'Headless CMS development & implementation', 'Move brand sites onto a headless CMS. (Needs a new name!)',
  '{"id":null,"name":"Tsvetan Antonov","email":"tsvetan@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Marketing']::text[], array['Wordpress', 'Webflow']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'growthStage', 'teams', 'systems']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000058', 'Implementing Marketing Intensive outcomes', 'Turn the Marketing Intensive''s outcomes into shipped changes.',
  '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  'Chop Chop', null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'teams', 'quarterTheme']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000059', 'Implementing Aussie Hackathon outcomes', 'Turn the Aussie Hackathon''s outcomes into shipped changes.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Leadership']::text[], '{}'::text[], '{}'::text[],
  'Chop Chop', null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'teams', 'quarterTheme']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

