# Git recovery record — 24 July 2026

Cove/SuperPanel was deployed directly from this local workspace before it had a
GitHub remote. During the first GitHub publication, macOS was found to have
evicted parts of both the working tree and the loose Git object database into
unreadable `dataless` placeholders.

The complete source was recovered from the latest READY production deployment
for `https://cove.leatherbacktravel.com/`. All 277 uploaded source files were
compared with the local workspace: 194 readable files matched byte-for-byte,
and the remaining unavailable files were restored from the same deployment
artifact. Local-only readable changes were preserved.

The legacy repository contained these four commits:

- `333d3b4` — Publish Cove and SuperPanel control plane
- `8d537f0` — Deploy the SuperPanel systems workspace
- `4955cb7` — Fix production Systems timestamp parsing
- `5c099d9` — Fix hyphenated application registration

The final commit object and tree remained readable, but at least one parent
object consistently terminated Git's packer with `SIGBUS`. GitHub received none
of the damaged history. The canonical private repository therefore begins with
one verified recovery baseline instead of pretending that the incomplete
legacy graph could be reproduced exactly.

Before publication, the recovered source passed the repository secret scan,
Git integrity and whitespace checks, 132 automated tests, CSS readability
checks, TypeScript validation, and the optimized Next.js production build.
