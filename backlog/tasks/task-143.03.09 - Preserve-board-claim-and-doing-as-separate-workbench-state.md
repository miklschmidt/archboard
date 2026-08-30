---
id: TASK-143.03.09
title: Preserve board claim and doing as separate workbench state
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.06.02
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-board-status
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the adapter and view for existing focused-pane connection, claim, doing history, semantic-context freshness, and Take back control in `src/ui/workbench-board-status`. This is the successor to the claim/doing-only TASK-140 AgentWorkbench content.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board connection, claim holder/reason, doing history, semantic-context delivery, and Take back control retain existing behavior and remain separate from Codex turn, queue, approval, coordinator, and voice state.
- [ ] #2 Disconnected, reconnecting, unclaimed, claimed, take-back pending/success/failure, semantic fresh/stale/ambiguous/refused/outcome_unknown states are named and never conflated with thread execution.
- [ ] #3 Existing TASK-140 claim/take-back browser assertions remain green; tests at src/ui/workbench-board-status/tests exhaust closed adapter states, accessibility status, keyboard focus, both themes, and no board-note write from presentation.
<!-- AC:END -->
