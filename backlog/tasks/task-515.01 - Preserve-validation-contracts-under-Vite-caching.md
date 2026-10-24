---
id: TASK-515.01
title: Preserve validation contracts under Vite+ caching
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 03:03'
updated_date: '2026-10-24 03:21'
labels: []
dependencies: []
parent_task_id: TASK-515
type: bug
ordinal: 924000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The cached task gate introduced Chromium child-process failures, two Git worktree failures, a renderer timing failure, and a stale-build refusal after output restoration. The same suite passed through the previous command chain. Resolve the Vite+ execution boundary and cached-build freshness without changing assertions, timeout limits, or cache requirements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Focused Chromium and Git owners pass under cached task execution with the existing process contracts and timeout limits.
- [ ] #2 A cached frontend restoration passes freshness when the source content matches, while missing, stale, and failed builds remain refused.
- [ ] #3 The full gate passes and its unchanged repeat reuses cached validation results.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected. Build focused red-capable reproductions for child-process execution and cached build freshness. Test ranked causes, fix only the identified boundaries, run focused owners, and repeat the complete gate with caching.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Red loop: Vite+ test:probe ran the existing rasterizer and vault-checkout owners and reproduced Chromium fspy_preload_unix ESRCH failures and Git exit 128. Explicit inputs plus output: [] remove the tracer without disabling caching. Chromium then passed. A separate Git loop found fixture commits reading the user signing configuration after SSH_AUTH_SOCK was filtered. Both fixture command loops now ignore global/system Git configuration, as their existing helpers do. The focused cached profile passes 64 tests across five files, including the original renderer bound (Agent workbench track: 2,580.7 ms below 3,000 ms). No timeout or assertion is weakened. Six content-freshness regression cases failed against timestamp logic and now pass. The build records its pre-compilation source fingerprint in the cached bundle.

The real frontend build emits the source record. Setting index.html to an old timestamp still reports current without rebuilding. Deleting the record and invoking the cached build restores it, and the browser adapter accepts it. The freshness path now returns immediately for matching content and retains all missing/stale/failure checks. The repository task fingerprints its Git index because tracked-file discovery is part of its contract. Temporary probe tasks and the Git probe script are removed.
<!-- SECTION:NOTES:END -->
