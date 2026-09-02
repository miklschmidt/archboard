---
id: TASK-143.03.06
title: Operate the linked workhorse queue
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-09-02 01:42'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:42
---
Course correction, 2026-09-02: divergent head 52b00a4d is not a merge candidate. Its 3,165 inserted lines and broad policy/test churn were built on the rejected browser contract after the OOM failures. Preserve only observable queue behavior as evidence and rebuild this UI leaf from the recovered base after TASK-143.08.05.
---
<!-- COMMENTS:END -->
