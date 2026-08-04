-- Retire the BotSwarm and Agentic OS products completely. Historical audit
-- events remain append-only; their application_id is nulled by the canonical
-- application foreign key when the registrations are removed.

delete from app_builder_requests
where target_application_id in (
  'dc84d929-96f5-4dab-afd0-fb8144596b4a',
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
);

delete from cove_sso_workflow_events
where integration_id in (
  select id from cove_sso_integrations
  where application_id in (
    'dc84d929-96f5-4dab-afd0-fb8144596b4a',
    'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
  )
);

delete from cove_sso_evidence
where integration_id in (
  select id from cove_sso_integrations
  where application_id in (
    'dc84d929-96f5-4dab-afd0-fb8144596b4a',
    'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
  )
);

delete from cove_sso_integrations
where application_id in (
  'dc84d929-96f5-4dab-afd0-fb8144596b4a',
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
);

delete from managed_assets
where application_id in (
  'dc84d929-96f5-4dab-afd0-fb8144596b4a',
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
);

delete from application_sessions
where application_id in (
  'dc84d929-96f5-4dab-afd0-fb8144596b4a',
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
);

delete from applications
where id in (
  'dc84d929-96f5-4dab-afd0-fb8144596b4a',
  'b98aef40-9a08-44f3-8bb9-f840e37e92c4'
);

drop table botswarm_feed_events;
drop table botswarm_review_decisions;
drop table botswarm_match_candidates;
drop table botswarm_external_reviews;
drop table botswarm_runs;
drop table botswarm_bots;
