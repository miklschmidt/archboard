---
id: TASK-465
title: Hosted test lanes hang in synchronous child spawns until the case timeout
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-11 22:33'
updated_date: '2026-10-11 23:06'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hosted evidence on Bun 1.4.0: run 38164719628 (both attempts) and 38170022242 attempt 2 time out install-targets, install-artifacts, codex-realtime real-process and local-bind; every hung case is a spawnSync, execFileSync or Bun.spawnSync call from the bun test process, with empty stdout and stderr, and once one hangs the next synchronous spawn in that process usually hangs too. The macOS job of 38153663557 attempt 1 shows the same in the code-target resolution fixture (Bun.spawnSync git init). Async spawns in the same window pass. Bun issue oven-sh/bun#34069 describes this exact failure (lost child exit, zombie, spin until timeout) and PR oven-sh/bun#44581 fixes it; the fix is in bun-v1.4.3 and not in 1.4.1 or 1.4.2.

Diagnostic runs with a process watchdog (38176977625, 38178028512, 38179430149, 38180803797) did not reproduce the hang on Bun 1.4.0 in about 15 system lanes; the upstream report notes that extra CPU load makes the race rarer. Run 38181738011 attempt 1 repeats the unchanged gate without a watchdog: Bun 1.4.0 control hangs in 2 of 5 system lanes (gate 4 install-targets, gate 5 codex-realtime) with the same signature; pinned Bun 1.4.3 passes 6 of 6 complete gates and 2 of 2 macOS jobs.

Bun 1.4.3 reports a refused fetch with code ECONNREFUSED and a message prefixed with it. tests/system/cli/resource-cleanup.test.ts now accepts either code and no longer pins Bun's message. Product classification in server-client-transport still covers both versions (message prefix on older Bun, ECONNREFUSED code on 1.4.3).

Local complete gate with Bun 1.4.3 on d385acaa6: exit 0; 4505 module tests, 198 system tests, repository lane and 19 browser owners pass. The downloaded Bun binary needs its interpreter patched to the Nix glibc loader on this box; through nix-ld it adds LD_LIBRARY_PATH to child environments and fails the closed-environment Codex process case.
<!-- SECTION:NOTES:END -->
