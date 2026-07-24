-- Keep new append-only audit events compatible with Cove's redacted scalar feed.
-- One historical systems.asset_updated event contains a legacy delegates array;
-- the application read boundary summarizes that known field without exposing it,
-- so this forward-only constraint is intentionally NOT VALID for old rows.
create or replace function audit_metadata_is_feed_safe(candidate jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(candidate) = 'object'
    and (select count(*) <= 12 from jsonb_object_keys(candidate))
    and not exists (
      select 1
      from jsonb_each(candidate) as entry(key, item)
      where entry.key !~ '^[a-z][a-z0-9_]{0,63}$'
        or entry.key ~* '(authorization|cookie|credential|password|secret|session|token|api_?key|raw|pii)'
        or jsonb_typeof(entry.item) not in ('string', 'number', 'boolean', 'null')
        or (
          jsonb_typeof(entry.item) = 'string'
          and (
            length(btrim(
              entry.item #>> '{}',
              U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
            )) = 0
            or octet_length(entry.item #>> '{}') > 160
            or (entry.item #>> '{}') ~ '[[:cntrl:]]'
          )
        )
        or (
          jsonb_typeof(entry.item) = 'number'
          and abs((entry.item #>> '{}')::numeric) > '1.7976931348623157e308'::numeric
        )
    )
$$;

alter table audit_events
  add constraint audit_events_feed_safe_metadata
  check (audit_metadata_is_feed_safe(metadata))
  not valid;
