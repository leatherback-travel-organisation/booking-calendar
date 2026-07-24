-- SuperPanel is live on Vercel, but its company GitHub repository has not been
-- published yet. Keep repository metadata empty until GitHub confirms it exists.

update managed_assets
set
  repository_path = null,
  repository_url = null,
  updated_at = now()
where application_id = '4f96c764-d6f7-4f7f-9d76-99ec9cc89e31'
  and repository_path = 'leatherback-travel-organisation/superpanel';
