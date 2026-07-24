-- Keep source metadata atomic and canonical. Runtime validation remains the
-- final trust boundary before registry values become entitlements or links.

alter table applications
  add constraint applications_repository_pair_complete check (
    (repository_path is null and repository_url is null)
    or
    (repository_path is not null and repository_url is not null)
  ),
  add constraint applications_repository_path_shape check (
    repository_path is null
    or repository_path ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
  ),
  add constraint applications_repository_url_matches_path check (
    repository_url is null
    or lower(repository_url) = lower('https://github.com/' || repository_path)
  ),
  add constraint applications_launch_url_no_credentials check (
    launch_url !~ '^https://[^/]*@'
  );
