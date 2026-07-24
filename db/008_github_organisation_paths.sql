-- Repositories moved from the legacy leatherbacktravel personal account to
-- the company-owned GitHub organisation. Keep this as a forward migration so
-- existing databases and fresh installs converge on the same canonical paths.

update applications as application
set
  repository_path = repository.repository_path,
  repository_url = repository.repository_url,
  updated_at = now()
from (
  values
    (
      'trtl',
      'leatherback-travel-organisation/trtl',
      'https://github.com/leatherback-travel-organisation/trtl'
    ),
    (
      'leatherback-answers',
      'leatherback-travel-organisation/leatherback-answers',
      'https://github.com/leatherback-travel-organisation/leatherback-answers'
    ),
    (
      'supplier-portal',
      'leatherback-travel-organisation/leatherback-supplier-portal-v2',
      'https://github.com/leatherback-travel-organisation/leatherback-supplier-portal-v2'
    )
) as repository(slug, repository_path, repository_url)
where application.slug = repository.slug
  and (
    application.repository_path is distinct from repository.repository_path
    or application.repository_url is distinct from repository.repository_url
  );
