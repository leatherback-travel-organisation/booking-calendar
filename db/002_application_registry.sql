-- Canonical Cove application registry. Every application exposes exactly the
-- two access provisions used by SuperPanel: User and Admin.

insert into applications (
  slug,
  name,
  description,
  launch_url,
  owner_name,
  repository_path,
  repository_url,
  status,
  risk,
  allows_employees,
  allows_external_partners
) values
  ('trtl', 'TRTL', 'Trips, bookings and operational workflow', 'https://trtl.vercel.app', 'Operations', 'leatherbacktravel/trtl', 'https://github.com/leatherbacktravel/trtl', 'active', 'restricted', true, false),
  ('leatherback-answers', 'Leatherback Answers', 'Restricted natural-language business analytics', 'https://leatherback-answers.vercel.app', 'Leadership', 'leatherbacktravel/leatherback-answers', 'https://github.com/leatherbacktravel/leatherback-answers', 'active', 'restricted', true, false),
  ('supplier-portal', 'Supplier Portal', 'Shared supplier workflow for employees and invited partners', 'https://leatherback-supplier-portal-v2.vercel.app', 'Supplier Operations', 'leatherbacktravel/leatherback-supplier-portal-v2', 'https://github.com/leatherbacktravel/leatherback-supplier-portal-v2', 'active', 'sensitive', true, true),
  ('1mwu', '1MWU', 'Shared 1MWU planning and operations spreadsheet', 'https://docs.google.com/spreadsheets/d/1KuxRxUy5MlUNof1dC7oGuHRomsb5wDqBJC3fFPTeXN0/edit?gid=0#gid=0', 'Operations', null, null, 'active', 'standard', true, false),
  ('money', 'Your Money', 'Invoices, travel credits and reimbursements', 'https://lbcove.vercel.app/money', 'Finance', null, null, 'active', 'sensitive', true, false),
  ('injuries', 'Injury Reporting', 'Private workplace injury reporting', 'https://lbcove.vercel.app/injuries', 'People & Operations', null, null, 'active', 'restricted', true, false)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  launch_url = excluded.launch_url,
  owner_name = excluded.owner_name,
  repository_path = excluded.repository_path,
  repository_url = excluded.repository_url,
  status = excluded.status,
  risk = excluded.risk,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners,
  updated_at = now();

with role_seed(slug, role_key, name, access_level, employee, partner) as (
  values
    ('trtl', 'user', 'TRTL User', 'user'::application_access_level, true, false),
    ('trtl', 'admin', 'TRTL Admin', 'admin'::application_access_level, true, false),
    ('leatherback-answers', 'user', 'Answers User', 'user'::application_access_level, true, false),
    ('leatherback-answers', 'admin', 'Answers Admin', 'admin'::application_access_level, true, false),
    ('supplier-portal', 'user', 'Supplier Portal User', 'user'::application_access_level, true, true),
    ('supplier-portal', 'admin', 'Supplier Portal Admin', 'admin'::application_access_level, true, false),
    ('1mwu', 'user', '1MWU User', 'user'::application_access_level, true, false),
    ('1mwu', 'admin', '1MWU Admin', 'admin'::application_access_level, true, false),
    ('money', 'user', 'Money User', 'user'::application_access_level, true, false),
    ('money', 'admin', 'Money Admin', 'admin'::application_access_level, true, false),
    ('injuries', 'user', 'Injury Reporting User', 'user'::application_access_level, true, false),
    ('injuries', 'admin', 'Injury Reporting Admin', 'admin'::application_access_level, true, false)
)
insert into application_roles (
  application_id,
  role_key,
  name,
  access_level,
  allows_employees,
  allows_external_partners
)
select a.id, rs.role_key, rs.name, rs.access_level, rs.employee, rs.partner
from role_seed rs
join applications a on a.slug = rs.slug
on conflict (application_id, role_key) do update set
  name = excluded.name,
  access_level = excluded.access_level,
  allows_employees = excluded.allows_employees,
  allows_external_partners = excluded.allows_external_partners;

with permission_seed(slug, role_key, permission) as (
  values
    ('trtl', 'user', 'trtl.read'),
    ('trtl', 'admin', 'trtl.read'),
    ('trtl', 'admin', 'trtl.manage_access'),
    ('leatherback-answers', 'user', 'answers.ask'),
    ('leatherback-answers', 'admin', 'answers.ask'),
    ('leatherback-answers', 'admin', 'answers.manage_access'),
    ('supplier-portal', 'user', 'supplier.read_own'),
    ('supplier-portal', 'admin', 'supplier.read'),
    ('supplier-portal', 'admin', 'supplier.manage_access'),
    ('1mwu', 'user', 'one_mwu.open'),
    ('1mwu', 'admin', 'one_mwu.open'),
    ('1mwu', 'admin', 'one_mwu.manage_access'),
    ('money', 'user', 'money.read_own'),
    ('money', 'user', 'money.submit'),
    ('money', 'admin', 'money.read_own'),
    ('money', 'admin', 'money.submit'),
    ('money', 'admin', 'money.read_all'),
    ('money', 'admin', 'money.review'),
    ('injuries', 'user', 'injuries.read_own'),
    ('injuries', 'user', 'injuries.submit'),
    ('injuries', 'admin', 'injuries.read_own'),
    ('injuries', 'admin', 'injuries.submit'),
    ('injuries', 'admin', 'injuries.read_all'),
    ('injuries', 'admin', 'injuries.review')
)
insert into role_permissions (role_id, permission)
select ar.id, ps.permission
from permission_seed ps
join applications a on a.slug = ps.slug
join application_roles ar on ar.application_id = a.id and ar.role_key = ps.role_key
on conflict do nothing;
