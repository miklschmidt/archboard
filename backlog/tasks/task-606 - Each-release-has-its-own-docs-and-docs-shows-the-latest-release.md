---
id: TASK-606
title: Each release has its own docs, and /docs/ shows the latest release
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-08T15:10:00Z'
updated_date: '2026-11-08T15:31:00Z'
labels: []
dependencies: []
ordinal: 1061000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The docs site describes the CLI on main, but readers install a release from npm. Since 0.2.0, main and the release can differ: a reader on a release sees options that their CLI lacks, and a guide pin goes stale with every release. The owner decided (2026-11-08): /docs/ shows the latest release, each release stays at /docs/<version>/, main is at /docs/next/, and each release builds its docs from its own tag when it is published. No derived docs are committed. Releases before the first one with docs (0.1.0, 0.2.0) have none.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release workflow builds the docs of the released tag and attaches them to its GitHub release
- [ ] #2 The site deploy serves the newest release with docs at /docs/, every release with docs at /docs/<version>/, and main at /docs/next/. Without a release that has docs, /docs/ shows main
- [ ] #3 Every docs page offers a switcher between the versions, and it lists versions that were released after the page was built
- [ ] #4 The pages of main and of an older release say which version they describe and link to the latest release
- [ ] #5 Search, internal links and the edit link of each version stay inside that version and its own source
- [ ] #6 The guides show the version of the CLI that their docs describe, and the build refuses a pinned version that is written by hand
- [ ] #7 The archboard-dev skill says how a release gets its docs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A docs build knows its version: `DOCS_VERSION` (`next` by default, the version for a release) and `DOCS_REF` (the Git ref of its source, `main` by default). Each docs page states its root and version on `<html>`. No script bundle holds a docs path, so one build can be mounted at any docs root.
2. Search indexes `dist/docs` alone, and the page script loads Pagefind from its own docs root, so each version searches only itself.
3. `site/scripts/versions.ts` assembles the deploy: main at `/docs/next/`, each release at `/docs/<version>/`, the newest release (or main, when no release has docs) at `/docs/`, and `docs/versions.json`. It moves a tree by rewriting the docs root in its HTML and merges the hashed assets. The link check runs on the result.
4. `site.yml` gains a `workflow_call` with a `release` input. Called by `release.yml` after publication, it builds the tag's docs and attaches `docs.tar.gz` to the release, then builds main and deploys every version. A push to main deploys every version, too.
5. A version switcher in the docs bar, and a note on main and older versions, read `versions.json` at run time, so an old release lists newer ones.
6. The guides write `{{version}}` where they pin the CLI, a remark plugin fills in the version, and `guides.ts` refuses a pinned version written by hand.
7. Pages that name their source (the CLI overview, the edit link) follow `DOCS_VERSION` and `DOCS_REF`.
8. ADR for versioned docs, the archboard-dev skill and `site/DESIGN.md` for the switcher.

Review fixes: repair the guide version tokens and release-version substitution. Make release discovery fail on download errors. Check release concurrency, assembled links, search, and the version switch. Run the requested gates and commit each verified fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built and checked locally (2026-11-08): a release build with DOCS_VERSION=0.3.0 DOCS_REF=v0.3.0, a fake 0.2.9 copy and main, assembled with site/scripts/versions.ts. links.ts passes on 65 pages. In the browser: /docs/ is 0.3.0 with no note, /docs/next/ and /docs/0.2.9/ name their version and link to the latest, the switch lists every version and marks the current one, Escape closes it and returns focus, search results stay under their own root, release pages link to their tag and pin @v0.3.0. Without releases, /docs/ and /docs/next/ are main (33 pages, links pass). actionlint 1.7.12 passes on site.yml and release.yml. The release leg of site.yml runs first on the next release, so its first real run is the proof of the workflow.

Review scope: 8076b638c...579024abc in docs/versioned-docs. The architecture read resolves to this checkout. The fixes preserve ADR 0077 and its module boundaries, so they need no new architecture proposal.

Review fix: quote the YAML version tokens so formatting preserves them. Fill guide pins from DOCS_VERSION for release builds and reject tokens that formatting splits. A 0.3.0 build shows scalar 0.3.0 pins and @v0.3.0 Action refs. A malformed-token probe fails the guide guard.

Review fix: discover published releases through the paginated GitHub API and select only releases with docs.tar.gz. List and download failures now stop assembly. Shell probes reproduce the old silent success and show nonzero exits for both failures after the fix. An empty release list still succeeds.

Review fix: attach each release archive before it enters the deploy queue. GitHub can replace a pending deployment without canceling the release attachment. Assembly and Pages deployment now share one serialized job, so each queued deployment fetches the archives after it starts. PR builds still replace earlier builds of the same PR. Validation: lint and formatting pass with no code warnings. Repository policy passes all 170 tests. The main and release site builds pass, and actionlint passes both workflows. Assembly passes internal links for 65 pages with two synthetic releases and 33 pages without releases. Browser probes cover main, the release root, the latest alias, search isolation, tagged source links, Escape focus on the switch, mobile layout, and an old build listing a newer release. The browser session is closed. Live GitHub release upload and Pages deployment remain untested until the next release. Simplification pass: keep one job for archive assembly and deployment, and limit write permission to the release attachment job.
<!-- SECTION:NOTES:END -->
