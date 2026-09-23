---
id: TASK-321
title: A workhorse outcome reaches the voice even when the coordinator is busy
status: To Do
assignee: []
created_date: '2026-09-23 22:43'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/server/canvas/lib/codex-workbench-outcome-report.ts
  - src/runtime/codex-coordinator-callbacks/lib/deliver.ts
priority: high
type: bug
ordinal: 553000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While voice is live, the host runs the coordinator with each outcome of work it handed the workhorse (completed, failed, outcome_unknown, and attention, see TASK-291 and TASK-316), so the voice model can tell the user. The host waits at most COORDINATOR_IDLE_WAIT_MS (10 s) for the coordinator to be idle, because callbacks are delivered one at a time and the ones behind wait with it. Past that it injects the outcome into the coordinator thread with thread/inject_items, which starts no turn: the voice model is never told, and the user hears nothing unless they speak again. A coordinator busy for more than 10 s is ordinary (it answers a handoff with several tool calls). Codex 0.155.1 also has thread/queue/add, which starts a queued turn when the current one ends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An outcome that arrives while the coordinator is busy starts its coordinator turn once the coordinator is idle, however long that takes, while voice is still live
- [ ] #2 Waiting for an idle coordinator does not hold back the callbacks behind it
- [ ] #3 An outcome whose voice session ended before the coordinator became idle is injected as today, and no turn is started
- [ ] #4 One owner proves an outcome delivered after a coordinator turn longer than the old bound
<!-- AC:END -->
