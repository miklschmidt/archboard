---
id: TASK-515.01
title: Preserve validation contracts under Vite+ caching
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24 03:03'
updated_date: '2026-10-24 03:42'
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
- [x] #1 Focused Chromium and Git owners pass under cached task execution with the existing process contracts and timeout limits.
- [x] #2 A cached frontend restoration passes freshness when the source content matches, while missing, stale, and failed builds remain refused.
- [x] #3 The full gate passes and its unchanged repeat reuses cached validation results.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected. Build focused red-capable reproductions for child-process execution and cached build freshness. Test ranked causes, fix only the identified boundaries, run focused owners, and repeat the complete gate with caching.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Red loop: Vite+ test:probe ran the existing rasterizer and vault-checkout owners and reproduced Chromium fspy_preload_unix ESRCH failures and Git exit 128. Explicit inputs plus output: [] remove the tracer without disabling caching. Chromium then passed. A separate Git loop found fixture commits reading the user signing configuration after SSH_AUTH_SOCK was filtered. Both fixture command loops now ignore global/system Git configuration, as their existing helpers do. The focused cached profile passes 64 tests across five files, including the original renderer bound (Agent workbench track: 2,580.7 ms below 3,000 ms). No timeout or assertion is weakened. Six content-freshness regression cases failed against timestamp logic and now pass. The build records its pre-compilation source fingerprint in the cached bundle.

The real frontend build emits the source record. Setting index.html to an old timestamp still reports current without rebuilding. Deleting the record and invoking the cached build restores it, and the browser adapter accepts it. The freshness path now returns immediately for matching content and retains all missing/stale/failure checks. The repository task fingerprints its Git index because tracked-file discovery is part of its contract. Temporary probe tasks and the Git probe script are removed.

Final gate at 8d9bdaa55: bun run check exits 0 in 559.091 seconds. It runs 4,901 module, 257 system, 142 repository, and 28 browser tests across 19 browser owners. The unchanged repeat exits 0 in 0.528 seconds with all 12 task results cached. Vite+ reports 561.72 seconds saved. Logs: /tmp/archboard-task515-repaired-check.log and /tmp/archboard-task515-repaired-repeat.log. Both lint policies report zero warnings and errors. The existing large-bundle advisory remains. Git tracked-entry hashing replaces the initial raw index input. This keeps repository cache keys portable across linked worktrees and stable across checkout timestamps. No product owner, assertion, lint rule, or timeout changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cached validation preserves the Chromium, Git fixture, renderer timing, and frontend freshness contracts. Explicit inputs avoid Chromium tracing failures while retaining cached results. Build freshness compares source content and accepts restored output. Six regression tests cover freshness outcomes. The complete gate passes 5,328 tests. The unchanged repeat reuses all 12 results in 0.528 seconds.
<!-- SECTION:FINAL_SUMMARY:END -->
