do $$
declare
  v_application_id uuid;
  v_asset_count integer;
begin
  select id
  into v_application_id
  from applications
  where slug = 'toucan';

  if v_application_id is null then
    raise exception 'Toucan must exist before its organization repository can be linked.';
  end if;

  update applications
  set repository_path = 'leatherback-travel-organisation/leatherback-leave',
      repository_url = 'https://github.com/leatherback-travel-organisation/leatherback-leave',
      updated_at = now()
  where id = v_application_id;

  update managed_assets
  set repository_path = 'leatherback-travel-organisation/leatherback-leave',
      repository_url = 'https://github.com/leatherback-travel-organisation/leatherback-leave',
      updated_at = now()
  where application_id = v_application_id;

  get diagnostics v_asset_count = row_count;
  if v_asset_count <> 1 then
    raise exception 'Toucan must have exactly one managed application asset.';
  end if;
end
$$;
