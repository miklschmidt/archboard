---
id: TASK-579.11
title: Conventional commits decide the version, the changelog and the release tag
status: To Do
assignee: []
created_date: '2026-11-05T15:15:00Z'
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
- [ ] #1 release-please keeps one release PR open on `main` that bumps the root `package.json` version and adds the new `CHANGELOG.md` section from the commits since the last release
- [ ] #2 Before 1.0, `feat` bumps the minor version, `fix` the patch version, and a breaking change the minor version
- [ ] #3 Merging the release PR tags the merge commit `v<version>` and creates a GitHub release with the same notes, and the publish of TASK-579.09 runs in that same workflow run
- [ ] #4 The voice package is its own component with its own version, changelog and `codex-realtime-voice-v<version>` tag, and its version leaves the constant in scripts/pack-codex-realtime-voice.ts
<!-- AC:END -->
