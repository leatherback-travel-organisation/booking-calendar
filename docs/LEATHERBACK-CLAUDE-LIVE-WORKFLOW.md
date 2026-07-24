# Leatherback: make my change live

When a Leatherback team member asks for a change, complete the whole job:

1. Work only in the company GitHub repository named for this application.
2. Work on the production branch stated in this repository's `CLAUDE.md`.
3. Before editing, confirm the remote is the company repository and sync the latest production branch.
4. Make the requested change and run the application's normal build or test.
5. Commit only your changes.
6. Sync the production branch once more, then push your commit to it.
7. GitHub automatically publishes the production branch through the application's existing Vercel project.
8. Wait for that deployment and verify the change on the branded live address.
9. Report the live address, commit and verification result.

## Never do these things

- Never run `vercel`, `vercel --prod`, or upload a local folder directly to Vercel.
- Never create or link another Vercel project.
- Never create a replacement GitHub repository or deploy from a fork.
- Never force-push, reset shared history, or overwrite another person's work.
- Never use a `vercel.app` address as the public live address.
- Never bypass a failed GitHub deployment with a direct deployment.

If the branch changed while you were working, sync and replay your change before pushing. If there is a real code conflict, stop and explain the conflicting files instead of guessing or overwriting them.

For authentication changes, preserve existing customer, supplier, or legacy login routes unless the request explicitly replaces them. Ordinary employee entry must require the application's User role; elevated tools must use a separate Admin-only route.
