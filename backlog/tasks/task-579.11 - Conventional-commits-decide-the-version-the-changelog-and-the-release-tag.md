---
id: TASK-579.11
title: Conventional commits decide the version, the changelog and the release tag
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T15:15:00Z'
updated_date: '2026-11-05T15:51:00Z'
labels: []
dependencies: []
references:
  - .github/workflows/ci.yml
  - package.json
  - scripts/pack-codex-realtime-voice.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1032000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants no hand-picked versions: the version bump, `CHANGELOG.md` and the `v<version>` tag on the released commit must come from the Conventional Commits that already land on `main` as squash-merged PR titles.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 release-please keeps one release PR open on `main` that bumps the root `package.json` version and adds the new `CHANGELOG.md` section from the commits since the last release
- [x] #2 Before 1.0, `feat` bumps the minor version, `fix` the patch version, and a breaking change the minor version
- [ ] #3 Merging the release PR tags the merge commit `v<version>` and creates a GitHub release with the same notes, and the publish of TASK-579.09 runs in that same workflow run
- [x] #4 The voice package is its own component with its own version, changelog and `codex-realtime-voice-v<version>` tag, and its version leaves the constant in scripts/pack-codex-realtime-voice.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. release-please-config.json + .release-please-manifest.json with components '.' (archboard, node, tag v<version>, root excludes the voice path) and packages/codex-realtime-voice (own changelog, tag codex-realtime-voice-v<version>), separate release PRs.
2. Voice version lives in packages/codex-realtime-voice/package.json (release-please node bumps it); pack script reads it.
3. .github/workflows/release.yml: release-please-action v5 on push to main, outputs, placeholder job gated on the root release for TASK-579.09.
4. actionlint, format:check, lint:all, test:repository.
5. Dry-run release-please against miklschmidt/archboard and record the proposal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: (1) Only bump-minor-pre-major is set. bump-patch-for-minor-pre-major would make feat bump the PATCH (release-please default.js: versioning-strategies/default.js:77), the opposite of AC2; verified: from 0.1.0, fix->0.1.1, feat->0.2.0, breaking->0.2.0. (2) separate-pull-requests: each component has its own release PR, so a voice change never forces a root release. (3) Root has exclude-paths for packages/codex-realtime-voice: the voice package is its own artifact, so its commits must not bump the archboard executable; a commit touching both still counts for both. (4) bootstrap-sha = main at 558d97cab so the first changelog lists only commits after the config landed; the repo has no tag yet. (5) Voice version lives in packages/codex-realtime-voice/package.json (seeded 0.1.0, was 0.0.0 with the 0.1.0 constant in the pack script); the pack script reads it; bun.lock workspace entry synced. (6) release-please makes its commits and tags through the GitHub API, so GitHub signs them; this satisfies the signed source commit rule without a signing key in CI. (7) Outputs per component use the action's path-prefixed names (packages/codex-realtime-voice--release_created); the root component has the unprefixed names. Placeholder job 'publish' is gated on release_created == 'true' for TASK-579.09 to replace.

Dry-run: the release-please CLI refuses (ConfigurationError: Missing required manifest versions) because it reads the config from the remote main, where it is not yet. A library dry run (Manifest.buildPullRequests, config files read locally, commits from GitHub, nothing written) with bootstrap-sha 6cae688bb proposed two PRs: 'chore(main): release 0.2.0' (root; Features and Bug Fixes from the squash titles #19..#44, refactor hidden, tag v0.2.0, compare v0.1.0...v0.2.0) and 'chore(main): release codex-realtime-voice 0.2.0' (only #19, #26 feat, #31 fix; compare codex-realtime-voice-v0.1.0...v0.2.0). With the committed bootstrap-sha (current main) it proposes nothing, as no commit follows. Needs a re-run against the remote once the config is on main. Checks: actionlint release.yml clean; format:check, lint:all, tsc pass; test:repository has 1 failure, interface width ceilings for skills (4>3) and workspace (42>40), from the merged fix/core-build-feedback branch and not from this change.

Verified on fix/core-build-feedback: release-please-config.json has root (node, tag v<version>, CHANGELOG.md, exclude-paths packages/codex-realtime-voice) and voice (tag codex-realtime-voice-v<version>) components, separate PRs, bump-minor-pre-major. A library dry run of Manifest.buildPullRequests with the worktree config proposed root 0.2.0 and voice 0.2.0 with conventional changelogs and nothing written. AC #3 (merge tags the merge commit and the publish runs in the same run) stays open until a real run on main; the publish job is TASK-579.09.
<!-- SECTION:NOTES:END -->
