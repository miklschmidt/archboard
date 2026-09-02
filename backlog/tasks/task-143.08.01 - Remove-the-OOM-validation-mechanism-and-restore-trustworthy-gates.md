---
id: TASK-143.08.01
title: Remove the OOM validation mechanism and restore trustworthy gates
status: To Do
assignee: []
created_date: '2026-09-02 01:36'
updated_date: '2026-09-02 01:43'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:43
---
Audit snapshot, 2026-09-02: the leaked owner was archboard-task143-r2-reload-owner-4.scope with observed PID 2996816 running bun --hot /tmp/archboard-codex-production-WKF70O/hot-production-server.ts. Re-resolve the unit and command before cleanup because the PID can change; remove only that verified unit and /tmp/archboard-codex-production-WKF70O, never a broad /tmp target.
---
<!-- COMMENTS:END -->
