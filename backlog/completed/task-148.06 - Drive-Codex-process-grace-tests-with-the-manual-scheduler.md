---
id: TASK-148.06
title: Drive Codex process grace tests with the manual scheduler
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 21:36'
updated_date: '2026-09-02 21:55'
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
- [x] #1 Module tests use the existing injected now, schedule, and cancel dependencies plus the manual scheduler instead of waiting the full CODEX_TERM_GRACE_MS.
- [x] #2 Focused coverage retains resistant descendant TERM-to-KILL escalation, stream and leader settlement, and exact cleanup.
- [x] #3 Focused duration evidence confirms the eliminated five-second grace wait without changing production grace behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the focused resistant-descendant owner at the fixed base and capture its existing lifecycle assertions and cleanup behavior.
2. Add a red-capable assertion that the owner uses injected scheduling while retaining the real spawned leader, inherited process group, descendant, and stdout settlement.
3. Inject the existing manual scheduler into only that real-process owner and drive stop through the production grace without changing production timings or semantics.
4. Run the focused owner, the complete codex-process module owner, narrow type/lint/format checks, then audit processes, temporary roots, and git scope. Record measured before/after evidence and commit the child task changes.

5. Amend the reviewed failure path: drive the injected scheduler from finally and add a real-process pre-stop failure regression that verifies owner, stream, process, group, descendant, and temporary-root cleanup.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured the unchanged resistant-descendant owner at 5.144 s wall clock, with its body at 5.060 s. Injected the existing manual scheduler into that real spawned-process owner and extended driveManual with an opt-in process-event yield so SIGKILL close/pipe events settle before the next virtual deadline. The owner now asserts the leader is gone at group cleanup, preserves early-exit and descendant terminal-state checks, and proves virtual time stops at the unchanged 5,000 ms CODEX_TERM_GRACE_MS.

Verification: focused owner 0.179 s; 10 repeated focused runs completed in 0.704 s total with individual bodies at 54.97-73.51 ms; process-lifecycle plus process-generation 13/13 pass in 0.496 s. Focused oxfmt, oxlint, backend tsc --noEmit, and git diff --check pass. No codex-fixture process remains. Nine /tmp/archboard-codex-process-test-* directories predate this task by hours or days; this run created no retained temporary root.

Standards-review amendment: kept the manual clock in scope for finally and changed the real resistant-descendant owner to drive owner.stop() with yieldToProcessEvents during every teardown route. Added a real-process regression that injects a failure before the main stop path, then proves stopped owner state, null current child, destroyed leader stdout, terminal/absent leader and descendant states, removed temporary root, and exactly 5,000 ms of virtual TERM grace. A controlled mutation back to direct owner.stop() made this regression time out at 5.000 s (5.105 s command wall); restoring driven teardown passed in 101.87 ms.

Amendment validation: both real-process owners passed 20/20 across ten repeated file runs in 1.454 s, bodies 57.94-84.60 ms. Process lifecycle plus generation passed 14/14 with 68 assertions in 0.683 s. Focused oxfmt and oxlint, backend tsc --noEmit, and git diff --check pass. Deliberate red-run roots were removed by exact path; no new temporary root or codex-fixture process remains.

Integration validation: cherry-picked reviewed commits 7c976b549c0f832d39bc55fe2126423ee21574e4 and 90106d84ecec41b10d71f2d08e4dab660d81f133 onto 09e24cc33a6fef743dae32e31c2f393907eb6f2b. bun test src/runtime/codex-process/tests/process-lifecycle.test.ts src/runtime/codex-process/tests/process-generation.test.ts passed 14/14 in 446 ms. It retained the real leader and TERM-resistant descendant, pre-main-stop cleanup, stream/group/root cleanup, and virtual 5,000 ms grace assertions without a five-second wall wait. git diff --check 09e24cc33a6fef743dae32e31c2f393907eb6f2b HEAD passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved Codex process grace coverage to the injected manual scheduler while retaining real-process escalation and failure cleanup. Reviewed integration passed the two focused owners, 14 tests in 446 ms, plus git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
