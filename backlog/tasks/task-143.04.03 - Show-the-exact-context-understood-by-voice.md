---
id: TASK-143.04.03
title: Show the exact context understood by voice
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-143.06.01
  - TASK-144
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-context
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own voice focus, selection, semantic-context freshness, and ambiguity presentation in `src/ui/voice-context`. It reads closed context projections and never takes a board snapshot or chooses a target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The view names bound pane/board/workhorse/coordinator, current focus and selection, semantic brief freshness, and any ambiguity that makes deictic speech unsafe.
- [ ] #2 Focus changes use ephemeral context, board changes use the semantic stream, and a restarted voice session shows a fresh brief rather than replaying idle deltas.
- [ ] #3 Unbound, stale, unavailable, prior-epoch, stopped, and child-exit states are explicit and never silently retarget to the newly focused pane.
<!-- AC:END -->
