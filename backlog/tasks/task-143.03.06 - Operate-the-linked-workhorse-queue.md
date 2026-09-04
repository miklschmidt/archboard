---
id: TASK-143.03.06
title: Operate the linked workhorse queue
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 02:54'
labels: []
dependencies:
  - TASK-143.03.01
  - TASK-143.07.02
  - TASK-144.19
  - TASK-144.14
  - TASK-143.08.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-queue
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own Archboard queue presentation and commands in `src/ui/workbench-queue`. This is owned source, not an assistant-ui Element; it consumes the exhaustive server snapshot and emits only legal add/edit/cancel/reorder/start commands.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The UI exposes Add, List/refresh, Edit, Cancel, Reorder, and Start; Edit emits queue update and Cancel emits queue delete, and no additional queue control exists.
- [ ] #2 Empty, loading, running, queued, interrupted-preserved, approval-blocked, failed, restarted, completed, stale, reconnecting, unavailable, and outcome_unknown states show exact queue/workhorse correlation and recovery.
- [ ] #3 Reorder submits all IDs and moves only coordinator-owned entries while preserving foreign relative order; no optimistic terminal/reorder state is committed, and authoritative reconciliation controls visible success.
- [ ] #4 src/ui/workbench-queue/tests covers all six operations, keyboard/pointer reorder, focus, labels, disabled reasons, stale snapshots, refusal, uncertainty, and cross-links.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build the closed module contract in src/ui/workbench-queue: exactly six controls (Add, List/refresh, Edit, Cancel, Reorder, Start) named as WORKBENCH_QUEUE_CONTROLS, with Edit bound to queueUpdate, Cancel bound to queueDelete, and List/refresh bound to the transport snapshot re-read because the gateway publishes no queueList browser command.
2. Write a pure projection over BrowserWorkbenchState plus transport capabilities that yields one view per AC #2 state (loading, empty, queued, running, interrupted-preserved, approval-blocked, failed, restarted, completed, stale, reconnecting, unavailable, outcome_unknown), each with exact queue/workhorse correlation (link state, thread id, thread status, active turn id and status, coordinator thread id) and one recovery sentence, plus per-control availability with a disabled reason.
3. Write a pure reorder planner: only coordinator-owned entries (entry.operationId is non-null) can move, foreign entries keep their absolute slots so their relative order is preserved, and the plan always yields the complete ordered submission id array. Cover keyboard step moves and pointer drop targets through the same planner.
4. Write the action layer over the transport captured-target API: every mutation passes the target captured when the queue was rendered, so a focus or link change refuses instead of retargeting. Settle each action from the authoritative command result and its snapshot only - delivered, refused with the gateway code, or outcome_unknown - and never commit optimistic terminal or reorder state.
5. Render the owned React surface (no assistant-ui import, no owner instantiation): a labelled queue region, one row per entry with position, ownership, submission id, correlated workhorse turn and coordinator operation cross-links, the six controls with accessible names and disabled reasons, keyboard reorder on the row, pointer drag-and-drop reorder, focus follow after a reorder, and a live region for settlement and uncertainty.
6. Cover it in src/ui/workbench-queue/tests with a local mounted DOM harness (the repository has no happy-dom or React Testing Library and TASK-143.03 serializes root dependency edits): projection states, reorder planning, action commands and refusal/uncertainty, and a mounted owner for keyboard/pointer reorder, focus, labels, disabled reasons and cross-links. Keep every test file under the 500-line lint cap.
7. Verify with bun run type-check, bun run lint, bun run fmt:check, bun run build:frontend, bun test --isolate over workbench-queue/transport/runtime, bun run test:repository, and bun run test:modules.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:42
---
Course correction, 2026-09-02: divergent head 52b00a4d is not a merge candidate. Its 3,165 inserted lines and broad policy/test churn were built on the rejected browser contract after the OOM failures. Preserve only observable queue behavior as evidence and rebuild this UI leaf from the recovered base after TASK-143.08.05.
---
<!-- COMMENTS:END -->
