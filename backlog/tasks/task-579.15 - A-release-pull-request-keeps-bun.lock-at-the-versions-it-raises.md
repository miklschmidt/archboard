---
id: TASK-579.15
title: A release pull request keeps bun.lock at the versions it raises
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T23:57:00Z'
updated_date: '2026-11-12T23:59:00Z'
labels: []
dependencies: []
references:
  - .github/workflows/release.yml
  - .github/actions/prepare/action.yml
documentation:
  - docs/agents/releasing.md
parent_task_id: TASK-579
ordinal: 1075000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 0.4.1 release commit (4c609e6a33) raised packages/codex-realtime-voice/package.json from 0.3.0 to 0.4.1, but bun.lock kept "version": "0.3.0" for that workspace package. So every fresh `bun install` on main rewrites that line. CI did not notice: `bun install --frozen-lockfile` passes when only the version of a workspace package differs. release-please has no bun.lock updater (googleapis/release-please#2689), and its json updater cannot parse bun.lock, which has trailing commas.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each release pull request that release-please creates or updates carries a bun.lock that `bun install` leaves unchanged
- [ ] #2 CI fails when `bun install` would change the committed bun.lock, and its error names the fix
- [ ] #3 bun.lock on main matches the workspace versions of 0.4.1
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sync bun.lock with `bun install`; only the voice package line changes, and bun.nix stays the same.
2. release.yml: a job after release-please, when it outputs `pr`, checks out the release branch, runs `bun install --lockfile-only`, and commits a changed bun.lock through the contents API, so GitHub signs it like the release-please commits.
3. The prepare action runs `bun install` and then fails when bun.lock changed, in place of `--frozen-lockfile`, which misses workspace versions.
4. docs/agents/releasing.md names the new step.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proof: the new prepare step fails on main (stale voice line) with the bun.lock error and passes on the synced lockfile. The lockfile job script, run against a temporary branch from main, committed only that line through the contents API and found no change on a second run. bun.nix is unchanged by the sync. A user token makes an unsigned commit, so the signature of the workflow-token commit is not proven locally.
<!-- SECTION:NOTES:END -->
