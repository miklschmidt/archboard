---
id: TASK-143.08.01
title: Remove the OOM validation mechanism and restore trustworthy gates
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-02 02:24'
labels: []
dependencies: []
references:
  - scripts/typescript-analysis.ts
  - tests/system/repository-policy/codex-protocol-boundary.test.ts
  - >-
    tests/system/repository-policy/support/codex-protocol-fingerprint-corpus.json
  - src/shared/timing/timing.ts
  - docs/agents/test-suite.md
parent_task_id: TASK-143.08
priority: high
type: bug
ordinal: 259000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This is the first and exclusive recovery gate. Replace repository checks that repeatedly start TypeScript 7 async whole-project compiler workers and leave compiler closure unawaited. Delete the generated fingerprint, mirror, and alias corpus instead of optimizing it. Restore bounded repository validation, repair the audit's deterministic gate failures and false-positive async assertions, and retire only the exactly identified leaked test process and temporary root. Do not begin generated-type, contract, startup, worktree, or feature work until this task is Done.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No repository test, test support, or script imports typescript/unstable/async, opens a whole-project compiler worker per case, or maintains the generated fingerprint, mirror, or alias corpus; the ordinary boundary owner retains one direct ignored-generated-path assertion.
- [ ] #2 Every promise assertion is awaited and every compiler, child, test server, timer, and process group started by an affected owner is awaited or synchronously reaped on success, failure, signal, and timeout; the cheapest stable lint or repository check prevents recurrence.
- [ ] #3 The timing policy includes CODEX_WAIT_TARGET_POLL_MS with its documented relationship, quarantine capacity crosses a module-root entrypoint, and vendor-element detection accepts the two legitimate workbench files without a file allowlist or weakened native-field rule.
- [ ] #4 The affected repository lane passes twice in fresh transient user units with MemoryMax=6G and MemorySwapMax=1G, stays below the limit, reports no OOM kill, and leaves each unit with no tasks or descendant processes after exit.
- [ ] #5 The owned archboard-task143-r2-reload-owner-4.scope and its exact temporary root are retired after identity verification; unrelated processes and user work remain untouched.
- [ ] #6 No timeout increase, skip, warning allowance, test deletion without retained behavior evidence, lint/type relaxation, or broad memory increase is used to obtain a pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory the OOM-producing TypeScript analysis, fingerprint, mirror, alias, promise-assertion, timing, quarantine-boundary, and vendor-field owners without running broad gates.
2. Delete the generated fingerprint and async whole-project analysis mechanisms; retain the cheapest direct ignored-generated-path and production-contract checks.
3. Repair the identified deterministic repository failures and await or reap every affected promise, compiler, child, timer, server, and process group.
4. Verify and retire only the named leaked systemd scope and exact temporary root, preserving every unrelated process and path.
5. Run focused checks, then run the affected repository lane twice in fresh transient units with MemoryMax=6G and MemorySwapMax=1G; record peak memory, OOM status, exit state, and descendant cleanup.
6. Obtain an independent fixed-range review, remediate findings with the same worker, and repeat review until clean before finalizing the leaf.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only policy audit 01a05feb-6467-7e80-83ed-ee37b5c0d676 completed at fixed base 71a3e6bf. Confirmed: CODEX_WAIT_TARGET_POLL_MS needs a machine-checked relation to CODEX_REQUEST_SETTLEMENT_MS; dynamic-tools must consume capacity through codex-transport/index.ts; the vendor alias detector must narrow by board-ingress context rather than allowlist two legitimate workhorse files; the compiler-worker fingerprint/mirror/alias unit can be deleted while retaining direct ignored-path and adapter/deep-import boundary checks; codex-realtime contract owners also import the forbidden async compiler helper and must be replaced or removed for AC #1. No files changed and no validation ran.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:43
---
Audit snapshot, 2026-09-02: the leaked owner was archboard-task143-r2-reload-owner-4.scope with observed PID 2996816 running bun --hot /tmp/archboard-codex-production-WKF70O/hot-production-server.ts. Re-resolve the unit and command before cleanup because the PID can change; remove only that verified unit and /tmp/archboard-codex-production-WKF70O, never a broad /tmp target.
---
<!-- COMMENTS:END -->
