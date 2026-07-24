-- Cove's public product address is the branded company domain. Vercel
-- project hostnames remain deployment infrastructure and must not appear in
-- the application directory or Systems portfolio.
update applications
set launch_url = 'https://cove.leatherbacktravel.com' ||
  case slug
    when 'superpanel' then '/systems'
    when 'money' then '/money'
    when 'injuries' then '/injuries'
    when 'recruitment' then '/recruitment'
    when 'botswarm' then '/botswarm'
    when 'agentic-os' then '/agentic-os'
  end
where slug in ('superpanel', 'money', 'injuries', 'recruitment', 'botswarm', 'agentic-os');

update managed_assets
set production_url = 'https://cove.leatherbacktravel.com' ||
  case slug
    when 'superpanel' then '/systems'
    when 'money' then '/money'
    when 'injuries' then '/injuries'
    when 'recruitment' then '/recruitment'
    when 'botswarm' then '/botswarm'
    when 'agentic-os' then '/agentic-os'
  end,
  updated_at = now()
where slug in ('superpanel', 'money', 'injuries', 'recruitment', 'botswarm', 'agentic-os');
