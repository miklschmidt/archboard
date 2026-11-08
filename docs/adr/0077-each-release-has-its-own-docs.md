---
status: accepted
---

# Each release has its own docs

The owner decided this on 2026-11-08. It extends the publication of
[ADR 0076](0076-a-release-is-a-compiled-executable-for-each-platform-on-npm.md) to the docs site.

## Context

The docs site generates its reference from the CLI and the Actions of the checkout that builds
it. GitHub Pages serves the build of main. A reader installs a release from npm. After
0.2.0, main and the release differ: the reference shows options that the reader's CLI lacks, and
each guide that pins a version goes stale at the next release. Releases 0.1.0 and 0.2.0 have no
docs pages.

## Decision

- `/docs/` shows the newest release that has docs. Each release that has docs stays at
  `/docs/<version>/`, and main is at `/docs/next/`. Without a release that has docs, `/docs/`
  shows main.
- When a release is published, its docs are built from its tag. The release workflow calls the
  site workflow with the tag. The site workflow builds the tag with `DOCS_VERSION` set to the
  version and `DOCS_REF` set to the tag. It attaches the result to the GitHub release as
  `docs.tar.gz`. The repository commits no copy of any version's docs.
- Every deploy builds main, fetches `docs.tar.gz` of every release, and mounts each build at its
  root (`site/scripts/versions.ts`). Each build is made for the root `/docs/`. Moving it rewrites
  that root in its HTML only. Its search index holds paths under its root, and its scripts hold no
  docs path, so both move unchanged.
- When a page loads, it reads `/docs/versions.json`. So a page of an old release offers the
  releases after it, and main and an older release say which version they describe.
- A guide writes `{{version}}` where it pins the CLI and `{{ref}}` where it pins an Action. A
  release's docs fill in that release and its tag. Main's docs fill in the latest release, which is
  the version in `package.json` on main, and `main`. The build refuses a version or an Action ref
  that a guide pins by hand.

## Consequences

- An old release's docs never change after its release. A fix to them needs a new release.
- A deploy that fetches the docs of every release grows with the number of releases. Each fetch
  is one download, with no build.
- A release whose site workflow predates this record cannot build its docs. The first release
  with docs is the first one after this record.
