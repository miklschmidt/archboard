---
id: TASK-148.06
title: Drive Codex process grace tests with the manual scheduler
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-02 21:43'
labels: []
dependencies: []
modified_files:
  - src/runtime/codex-process/tests/process-lifecycle.test.ts
  - src/runtime/codex-process/tests/lifecycle-support.ts
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 277000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex process tests retain real child and process-group behavior while their module timing advances through the injected scheduler instead of waiting for the full termination grace period.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Module tests use the existing injected now, schedule, and cancel dependencies plus the manual scheduler instead of waiting the full CODEX_TERM_GRACE_MS.
- [ ] #2 Focused coverage retains resistant descendant TERM-to-KILL escalation, stream and leader settlement, and exact cleanup.
- [ ] #3 Focused duration evidence confirms the eliminated five-second grace wait without changing production grace behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the focused resistant-descendant owner at the fixed base and capture its existing lifecycle assertions and cleanup behavior.
2. Add a red-capable assertion that the owner uses injected scheduling while retaining the real spawned leader, inherited process group, descendant, and stdout settlement.
3. Inject the existing manual scheduler into only that real-process owner and drive stop through the production grace without changing production timings or semantics.
4. Run the focused owner, the complete codex-process module owner, narrow type/lint/format checks, then audit processes, temporary roots, and git scope. Record measured before/after evidence and commit the child task changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured the unchanged resistant-descendant owner at 5.144 s wall clock, with its body at 5.060 s. Injected the existing manual scheduler into that real spawned-process owner and extended driveManual with an opt-in process-event yield so SIGKILL close/pipe events settle before the next virtual deadline. The owner now asserts the leader is gone at group cleanup, preserves early-exit and descendant terminal-state checks, and proves virtual time stops at the unchanged 5,000 ms CODEX_TERM_GRACE_MS.

Verification: focused owner 0.179 s; 10 repeated focused runs completed in 0.704 s total with individual bodies at 54.97-73.51 ms; process-lifecycle plus process-generation 13/13 pass in 0.496 s. Focused oxfmt, oxlint, backend tsc --noEmit, and git diff --check pass. No codex-fixture process remains. Nine /tmp/archboard-codex-process-test-* directories predate this task by hours or days; this run created no retained temporary root.
<!-- SECTION:NOTES:END -->
