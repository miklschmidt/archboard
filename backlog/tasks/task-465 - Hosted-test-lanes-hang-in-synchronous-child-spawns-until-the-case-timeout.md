---
id: TASK-465
title: Hosted test lanes hang in synchronous child spawns until the case timeout
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-11 22:33'
updated_date: '2026-10-11 22:33'
labels: []
dependencies: []
references:
  - 'https://github.com/oven-sh/bun/issues/34069'
  - 'https://github.com/oven-sh/bun/pull/44581'
type: bug
ordinal: 810000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hosted GitHub CI (Linux, and once macOS) intermittently fails whole runs of tests that spawn a child synchronously from the bun test process (spawnSync, execFileSync, Bun.spawnSync): install-targets, install-artifacts, the codex-realtime real-process cases, local-bind, and on macOS the code-target resolution fixture. Each waits for its 15 s case timeout with empty stdout and stderr, then the next synchronous spawn in the same process hangs too. Evidence: runs 38164719628 (both attempts), 38170022242 attempt 2, and the macOS job of 38153663557 attempt 1. The cause is Bun issue oven-sh/bun#34069: in Bun up to 1.4.2 the per-VM spawnSync event loop loses its poll count when a GC finalizer runs during a call, so later calls stop polling and lose the child exit and output. Bun 1.4.3 carries the fix (oven-sh/bun#44581). CI takes the Bun version from packageManager in package.json, which pinned 1.4.0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CI and local development run on a Bun release that carries the spawnSync loop fix
- [ ] #2 Repeated hosted complete gates on the fix show no synchronous-spawn hang
- [ ] #3 The complete local gate passes on the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin packageManager to bun@1.4.3, which setup-bun reads on both hosted jobs; the runtime and test code stay unchanged.
2. Compare Bun 1.4.0 and 1.4.3 hosted gates under a temporary watchdog on the throwaway branch diagnose-hosted-hangs, then run repeated hosted complete gates on the fix.
3. Run the complete local gate with Bun 1.4.3 on the fix.
No board is affected: the change pins the development toolchain and alters no product module or relationship.
<!-- SECTION:PLAN:END -->
