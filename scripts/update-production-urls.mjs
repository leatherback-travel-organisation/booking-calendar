import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const mappings = [
  { slug: "cia-magic-feed", productionUrl: "https://god.leatherbacktravel.com/" },
  { slug: "dmc-manager", productionUrl: "https://dmc.leatherbacktravel.com/" },
  { slug: "injuries", productionUrl: "https://cove.leatherbacktravel.com/injuries" },
  { slug: "leatherback-answers", productionUrl: "https://answers.leatherbacktravel.com/" },
  { slug: "money", productionUrl: "https://cove.leatherbacktravel.com/money" },
  { slug: "recruitment", productionUrl: "https://cove.leatherbacktravel.com/recruitment" },
  { slug: "salemi-ceramics-staff-portal", productionUrl: "https://sscportal.leatherbacktravel.com/" },
  { slug: "stitch-wednesday-ops", productionUrl: "https://ops.stitchwednesday.com/" },
  { slug: "superpanel", productionUrl: "https://cove.leatherbacktravel.com/systems" },
  { slug: "supplier-portal", productionUrl: "https://suppliers.leatherbacktravel.com/" },
  { slug: "trtl", productionUrl: "https://trtl.leatherbacktravel.com/" },
];

const sql = neon(databaseUrl, {
  fetchOptions: { signal: AbortSignal.timeout(30_000) },
});

const existing = await sql.query(
  "select slug from applications where slug = any($1::text[])",
  [mappings.map(({ slug }) => slug)],
);
const found = new Set(existing.map(({ slug }) => slug));
const missing = mappings.map(({ slug }) => slug).filter((slug) => !found.has(slug));
if (missing.length) throw new Error(`Canonical applications are missing: ${missing.join(", ")}`);

const updated = await sql.query(
  `with requested as (
      select slug, production_url
      from jsonb_to_recordset($1::jsonb) as record(slug text, production_url text)
    ), targets as materialized (
      select application.id, application.slug, application.launch_url as previous_url,
             requested.production_url
      from applications application
      join requested on requested.slug = application.slug
    ), updated_applications as (
      update applications application
      set launch_url = target.production_url,
          updated_at = now()
      from targets target
      where application.id = target.id
        and application.launch_url is distinct from target.production_url
      returning application.id, application.slug, application.launch_url
    ), updated_assets as (
      update managed_assets asset
      set production_url = target.production_url,
          updated_at = now()
      from targets target
      where asset.application_id = target.id
        and asset.production_url is distinct from target.production_url
      returning asset.id, asset.application_id
    ), audited as (
      insert into audit_events (
        action, outcome, actor_identity_subject, application_id,
        target_type, target_id, request_id, metadata
      )
      select
        'systems.production_url_updated', 'success', 'codex:canonical-domain-migration',
        target.id, 'application', target.id::text,
        'canonical-domain-migration-2026-07-17',
        jsonb_build_object('previous_url', target.previous_url, 'production_url', target.production_url)
      from targets target
      join updated_applications updated on updated.id = target.id
      returning id
    )
    select id::text, slug, launch_url
    from updated_applications
    order by slug`,
  [JSON.stringify(mappings.map(({ slug, productionUrl }) => ({ slug, production_url: productionUrl })))],
);

process.stdout.write(`${JSON.stringify({ updated: updated.length, applications: updated }, null, 2)}\n`);
