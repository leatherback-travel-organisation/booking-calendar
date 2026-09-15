-- Overlap awareness established from the Slack history sweep (1 Sep 2026,
-- May-Sep window). Only pairs where EVERY involved person demonstrably saw
-- the two projects discussed together are recorded; "partial" verdicts stay
-- loud. Evidence summarised in note; the full report lives with Nicola.

insert into garden.overlap_awareness (project_a, project_b, source, note)
select v.project_a::uuid, v.project_b::uuid, 'slack', v.note
from (values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Briana and Courtney post paired Guest Portal / TRTL updates in #project-aussie-hackathon (19-20 Aug); Courtney''s sign-offs pair them ("TRTL and guest portal edits")'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000070',
   'Courtney and Kat coordinate TRTL vs activity-log field requests in #project-activity-log and #ask-systems (24-31 Aug); "activity feed notes -> TRTL" noted 14 Aug'),
  ('00000000-0000-4000-8000-000000000056', '00000000-0000-4000-8000-000000000057',
   'Fencox is the CMS tester brand in the Content Hub channel (Lisa-Ceco, 4 Aug); Justin and Ceco both active there through Aug')
) as v(project_a, project_b, note)
where exists (select 1 from garden.projects p where p.id = v.project_a::uuid)
  and exists (select 1 from garden.projects p where p.id = v.project_b::uuid)
on conflict (project_a, project_b) do nothing;
