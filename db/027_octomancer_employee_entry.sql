-- Cove must launch the employee SSO entry, while Octomancer keeps its
-- existing team-password entry at the root during the transition.

update applications
set launch_url = 'https://octomancer.leatherbacktravel.com/employee',
    updated_at = now()
where slug = 'octomancer';

update managed_assets
set production_url = 'https://octomancer.leatherbacktravel.com/employee',
    updated_at = now()
where slug = 'octomancer';
