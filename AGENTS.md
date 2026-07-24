# SuperPanel delivery rule

- The canonical production site is **https://cove.leatherbacktravel.com/**. Always deploy and verify changes against this domain. Do not present `lbcove.vercel.app`, `ck-travel.vercel.app`, generated deployment URLs, or any other Vercel alias as the live site.
- The canonical Vercel target is team `leatherback-travel`, project `lbcove`, organization ID `team_bCUUoKPj3tAnwhOT5OvDgQwM`, and project ID `prj_4LYY66RXGjeRehe0mfheF5NkR10V`.
- Use `npm run deploy:production` for production deployments. This command pins both Vercel IDs, repairs stale local linkage, and advances `cove.leatherbacktravel.com` to the completed deployment.
- Do not run a bare `vercel --prod` command for production delivery.
- Treat user-requested product changes as production changes unless the user explicitly says "local only" or asks for a draft/preview.
- A change is not complete when it only works locally. Build it, deploy it to the linked Vercel production project, and verify the affected route on the production URL.
- In the final handoff, clearly state the live URL and production verification result. If production deployment is blocked, say so plainly and do not describe the change as finished.
- Never overwrite or remove unrelated workspace changes merely to make a deployment succeed.
