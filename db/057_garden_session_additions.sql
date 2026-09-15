-- Gardening-session additions and enrichments (Nicola, 31 Aug 2026 evening):
-- 11 new projects (Madi/Nevena/Bree/Kat/Ceco/Csilla/Ops rows) and richer
-- notes/teammates/stages for nine existing ones, straight from the supplied
-- table. Generated from src/lib/garden/seed-data.ts — regenerate, never
-- hand-edit. Guard: only rows untouched since seeding (last_edited_by is
-- null) are replaced; user-edited rows are left exactly as edited.

delete from garden.projects
where last_edited_by is null and id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000009',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000016',
  '00000000-0000-4000-8000-000000000017',
  '00000000-0000-4000-8000-000000000018',
  '00000000-0000-4000-8000-000000000019',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000022',
  '00000000-0000-4000-8000-000000000023',
  '00000000-0000-4000-8000-000000000024',
  '00000000-0000-4000-8000-000000000025',
  '00000000-0000-4000-8000-000000000026',
  '00000000-0000-4000-8000-000000000027',
  '00000000-0000-4000-8000-000000000028',
  '00000000-0000-4000-8000-000000000029',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
  '00000000-0000-4000-8000-000000000033',
  '00000000-0000-4000-8000-000000000034',
  '00000000-0000-4000-8000-000000000035',
  '00000000-0000-4000-8000-000000000036',
  '00000000-0000-4000-8000-000000000037',
  '00000000-0000-4000-8000-000000000038',
  '00000000-0000-4000-8000-000000000039',
  '00000000-0000-4000-8000-000000000040',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000043',
  '00000000-0000-4000-8000-000000000044',
  '00000000-0000-4000-8000-000000000045',
  '00000000-0000-4000-8000-000000000046',
  '00000000-0000-4000-8000-000000000047',
  '00000000-0000-4000-8000-000000000048',
  '00000000-0000-4000-8000-000000000049',
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000051',
  '00000000-0000-4000-8000-000000000052',
  '00000000-0000-4000-8000-000000000053',
  '00000000-0000-4000-8000-000000000054',
  '00000000-0000-4000-8000-000000000055',
  '00000000-0000-4000-8000-000000000056',
  '00000000-0000-4000-8000-000000000057',
  '00000000-0000-4000-8000-000000000058',
  '00000000-0000-4000-8000-000000000059',
  '00000000-0000-4000-8000-000000000060',
  '00000000-0000-4000-8000-000000000061',
  '00000000-0000-4000-8000-000000000062',
  '00000000-0000-4000-8000-000000000063',
  '00000000-0000-4000-8000-000000000064',
  '00000000-0000-4000-8000-000000000065',
  '00000000-0000-4000-8000-000000000066',
  '00000000-0000-4000-8000-000000000067',
  '00000000-0000-4000-8000-000000000068',
  '00000000-0000-4000-8000-000000000069',
  '00000000-0000-4000-8000-000000000070'
);

insert into garden.projects (
  id, name, purpose, owner, sponsor, teammates, growth_stage, estimated_completion,
  teams, systems, brands, quarter_theme, project_link, notes, cancellation_reason,
  testing_owners, testing_teams, related_project_ids, demo_fields,
  created_at, last_edited_at, stage_changed_at, completed_at, cancelled_at, archived_at
) values (
  '00000000-0000-4000-8000-000000000001', 'Guest Portal', 'Give guests one portal for their trip details, documents and pre-departure steps.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Active work', '2026-10-15',
  array['Booking Managers']::text[], array['Stacker', 'Airtable - Leatherback Bookings and Data base']::text[], '{}'::text[],
  null, null, 'Improving flights/extras request automation. Looking at adding conditions for declining accommodation — potentially part of hackathon.', null,
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
  '00000000-0000-4000-8000-000000000002', 'TRTL - Stacker replacement', 'Replace Stacker with our own Turtle platform before the licence renews.',
  '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-11-30',
  array['Booking Managers', 'Operations']::text[], array['Stacker']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'estimatedCompletion']::text[],
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
  'In Planning', '2026-09-30',
  array['Operations', 'Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, 'Online booking via WeTravel. Target: end of quarter.', null,
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
  '00000000-0000-4000-8000-000000000004', 'Today - BM Dashboard', 'Give Booking Managers one morning view of calls, departures and flags.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-09-30',
  array['Booking Managers']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'estimatedCompletion']::text[],
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
  '00000000-0000-4000-8000-000000000006', 'Exploring Web Design Capabilities', 'Learn what we can build in-house before committing to agency work.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
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
  '00000000-0000-4000-8000-000000000007', 'Automations', 'Round up the automations running across our systems.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
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
  '00000000-0000-4000-8000-000000000008', 'The Helm - Pod Lead Dashboard', 'Give pod leads a single dashboard of their pod''s numbers.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
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
  '00000000-0000-4000-8000-000000000009', 'New Supplier Portal', 'Build suppliers a portal for availability, rates and trip information.',
  '{"id":null,"name":"Radina Petrishka","email":"radina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-12-15',
  array['DMC']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'estimatedCompletion']::text[],
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
  '00000000-0000-4000-8000-000000000011', 'Toucan - Flamingo replacement', 'Replace Flamingo with our own team portal.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'Active work', '2026-10-31',
  array['HR & Hiring']::text[], array['Flamingo']::text[], '{}'::text[],
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
  '00000000-0000-4000-8000-000000000012', 'Octomancer', 'Automate our multi-channel content publishing tentacles.',
  '{"id":null,"name":"Dijana Blagojevic","email":"dijana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
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
  '00000000-0000-4000-8000-000000000013', 'HelpScout Side Panel', 'Show booking context beside every HelpScout conversation.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-09-30',
  array['Booking Managers', 'Operations']::text[], array['HelpScout - Adventure Brands']::text[], '{}'::text[],
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
  '00000000-0000-4000-8000-000000000014', 'Trip Coord Pod Interface Replacement', 'Rebuild the Trip Coordination pod''s day-to-day interface.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'Testing or roll out', null,
  array['Booking Managers', 'Operations']::text[], array['Airtable - Daily Operations base']::text[], '{}'::text[],
  null, null, 'Rolled out, except FenEx — needs a timeline on the FenEx rollout.', null,
  '[{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'systems', 'testingOwners']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'systems']::text[],
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
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[{"id":null,"name":"Sophie Stansfield","email":"sophie@caminowomen.com.au"}]'::jsonb,
  'Active work', null,
  '{}'::text[], '{}'::text[], '{}'::text[],
  null, null, 'Working well in CW & PA brand pods. Pausing moving edits to Stacker until we know more about the AI overhaul.', null,
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
  '00000000-0000-4000-8000-000000000017', 'Invoice Generator', 'Generate trip invoices automatically instead of by hand.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Booking Managers', 'Operations']::text[], array['Xero']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'systems']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000019', 'Pricing Process', 'Standardise how trips are priced and reviewed.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Trip Design']::text[], array['Airtable - Trip Design base']::text[], '{}'::text[],
  null, 'https://airtable.com/appCGfZdp3jpo8PCD/tblLJXSpo0H0vR4lu/viwmmHLveJ9MG4TcH', 'Pricing interface for the TD team — TD team + systems.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'systems']::text[],
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
  'In Planning', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
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
  '00000000-0000-4000-8000-000000000021', 'Pod Lead Dashboards / Databox', 'Give pod leads live numbers through Databox dashboards.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[]'::jsonb,
  'In Planning', null,
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  'In Planning', null,
  array['Trip Design']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000025', 'Hotel night management - Portal & AI', 'Manage extra hotel nights through the portal with AI assistance.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000033', 'FILL RATES - AI generated marketing segments', 'Turn fill-rate data into AI-generated marketing segments.',
  '{"id":null,"name":"Katarina Stanković","email":"katarina@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Marketing']::text[], '{}'::text[], '{}'::text[],
  'Gnarly Oozes', null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  'In Planning', '2026-10-31',
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage', 'brands']::text[],
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
  'In Planning', '2026-11-30',
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'growthStage']::text[],
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
  'In Planning', null,
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'teams', 'growthStage']::text[],
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
  '{"id":null,"name":"Tegan Weekley","email":"tegan@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Courtney Harman","email":"courtney@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Mandy Scanlon","email":"mandy@patchadventures.com.au"},{"id":null,"name":"Farrah Passmore","email":"farrah@patchadventures.com.au"},{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"},{"id":null,"name":"Lisa O''Donnell","email":"lisa@leatherbacktravel.com"}]'::jsonb,
  'In Planning', null,
  array['Operations', 'Booking Managers']::text[], array['Stacker', 'Payment Code and FAQ Extractor']::text[], '{}'::text[],
  null, null, 'SOP/info page; what info is in Stacker; sending res emails using the FAQ extractor; getting deposit amounts. TD (Madi + Lisa) aligning the AT fields being used, then pulled into Stacker — first step of a bigger project.', null,
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
  'In Planning', null,
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
  'In Planning', '2026-11-15',
  array['Booking Managers']::text[], array['Notion - Leatherback Travel', 'Stacker']::text[], '{}'::text[],
  null, null, 'Trip Summaries Notion → Stacker (or Turtle).', null,
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
  '00000000-0000-4000-8000-000000000049', 'Optimising call summaries', 'Improve call summaries towards hands-off activity feeds.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Jacqueline Lancaster","email":"jacqueline@carexdesign.com"}]'::jsonb,
  'Active work', null,
  array['Booking Managers']::text[], array['Aircall']::text[], '{}'::text[],
  null, null, 'Aircall summaries automation: a quick copy + paste function with detailed call summaries. Long-term aim: a hands-off automation maintaining activity feeds.', null,
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
  '00000000-0000-4000-8000-000000000050', 'Lead tidy-up', 'Tidy the lead pipeline before the 2027 season.',
  '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '{"id":null,"name":"Nicola Noviello","email":"nicola@leatherbacktravel.com"}'::jsonb, '[{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}]'::jsonb,
  'In Planning', null,
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
  'In Planning', null,
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
  'In Planning', null,
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
  'In Planning', '2026-09-30',
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'teams', 'systems', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000056', 'Fencox new website', 'Build the new Fencox Travel website.',
  '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '{"id":null,"name":"Justin Kelaher","email":"justin@patchadventures.com.au"}'::jsonb, '[]'::jsonb,
  'In Planning', '2026-12-15',
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
  'In Planning', '2026-09-30',
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'teams', 'quarterTheme', 'growthStage']::text[],
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
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'owner', 'teams', 'quarterTheme', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000060', 'Building Apps for all AT Interfaces', 'Turn every Airtable interface into a proper app.',
  '{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Booking Managers', 'Operations']::text[], array['Airtable - Daily Operations base']::text[], '{}'::text[],
  null, null, 'Hackathon task started — Brand Pod and Trip Coord so far. Working.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['teams', 'systems']::text[],
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
  '00000000-0000-4000-8000-000000000061', 'Fable AI Testing', 'Build AI prototypes for Daily Huddles and the Flamingo apps.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Operations']::text[], array['Flamingo']::text[], '{}'::text[],
  null, null, 'Needs: feedback from testers after the initial prototypes.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['teams', 'systems']::text[],
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
  '00000000-0000-4000-8000-000000000062', 'Automated tag adding in the Patch inbox', 'Add inbox tags automatically so Patch BMs stop tagging by hand.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', '2026-09-30',
  array['Booking Managers']::text[], array['HelpScout - Adventure Brands']::text[], array['Patch Adventures']::text[],
  null, null, 'Patch BMs are helping by reporting oozes in the channel; the script is updated from their feedback. Target: end of quarter.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['systems']::text[],
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
  '00000000-0000-4000-8000-000000000063', 'Reducing number of people in Airtable', 'Move BMs out of Airtable by giving them the Stacker fields they need.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, null, '[{"id":null,"name":"Tsvetan Antonov","email":"tsvetan@leatherbacktravel.com"},{"id":null,"name":"Madilyn Forster","email":"madilyn@caminowomen.com.au"},{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}]'::jsonb,
  'Active work', null,
  array['Booking Managers']::text[], array['Stacker', 'Airtable - Leatherback Bookings and Data base']::text[], '{}'::text[],
  null, null, 'Creating the Stacker fields for BMs, with Madi helping through the setup and structure.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['teams', 'systems']::text[],
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
  '00000000-0000-4000-8000-000000000064', 'New Supplier Notification for extras added within 30 days of trip start', 'Notify suppliers automatically when extras are added close to departure.',
  '{"id":null,"name":"Briana Bessell","email":"briana@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'Active work', null,
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, null, 'Drafted — need to add the details into the email.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['teams']::text[],
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
  '00000000-0000-4000-8000-000000000065', 'Email automations', 'FPR email template for guests who booked after FPD completed, usable within .FINALE.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', '2026-05-15',
  array['Operations']::text[], '{}'::text[], '{}'::text[],
  null, null, 'Ooze: time saving for Ops — no more rearranging the email template, key dates, etc.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000066', 'Mobile App', 'Build the Leatherback mobile app.',
  '{"id":null,"name":"Tsvetan Antonov","email":"tsvetan@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', '2026-09-30',
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
  '00000000-0000-4000-8000-000000000067', 'NAB Payments', 'Bring NAB payments into the payment flow.',
  '{"id":null,"name":"Tsvetan Antonov","email":"tsvetan@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', '2026-09-30',
  array['Finance']::text[], array['NAB Connect']::text[], '{}'::text[],
  null, null, '', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['purpose', 'teams', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000068', 'Systems total ownership', 'Give every system a clear owner across the Systems team.',
  '{"id":null,"name":"Csilla Bozsik","email":"csilla@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  '{}'::text[], '{}'::text[], '{}'::text[],
  null, 'https://docs.google.com/document/d/1rRnDb2uSQ87FMnpV72ggbI01wCZgSz4Pdm2ebbBSOQs/edit', 'With the Systems team. Notion board: patchadventures.notion.site/3603b112a0e080e99355df0223118755', null,
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
  '00000000-0000-4000-8000-000000000069', 'AI drafts for Adventure brands - HS inbox', 'Adapt the existing SC AI drafts to the adventure brands'' Help Scout inboxes.',
  '{"id":null,"name":"Nevena Mihajlovic","email":"nevena@leatherbacktravel.com"}'::jsonb, null, '[{"id":null,"name":"Ivana Strihic Dojcinovski","email":"ivana@leatherbacktravel.com"},{"id":null,"name":"Danko Cimbaljević","email":"danko@leatherbacktravel.com"},{"id":null,"name":"Nemanja Ilić","email":"nemanja@leatherbacktravel.com"},{"id":null,"name":"Branislav Zivanovic","email":"branislav@leatherbacktravel.com"}]'::jsonb,
  'In Planning', null,
  array['Operations']::text[], array['HelpScout - Adventure Brands']::text[], '{}'::text[],
  null, null, 'Take the existing SC AI drafts as an example and adapt to the adventure brands — upcoming mini AI hackathon project. Euro ops: Nevena, Ivana, Danko, Nemo, Branislav.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['owner', 'systems', 'growthStage']::text[],
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
  '00000000-0000-4000-8000-000000000070', 'Activity feed in HS', 'Let BMs and Ops write activity feed notes in Help Scout that sync to Stacker.',
  '{"id":null,"name":"Kat Stokes","email":"kat@leatherbacktravel.com"}'::jsonb, null, '[]'::jsonb,
  'In Planning', null,
  array['Booking Managers', 'Operations']::text[], array['HelpScout - Adventure Brands', 'Stacker']::text[], '{}'::text[],
  null, null, 'Currently paused.', null,
  '[]'::jsonb, '{}'::text[], '{}'::uuid[], array['growthStage']::text[],
  '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z', '2026-08-24T11:30:00Z',
  null, null, null
)
on conflict (id) do nothing;

