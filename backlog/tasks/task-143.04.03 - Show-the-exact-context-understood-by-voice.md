---
id: TASK-143.04.03
title: Show the exact context understood by voice
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 15:42'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-143.06.01
  - TASK-144.14
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
- [ ] #1 The view names bound pane/board/workhorse/coordinator plus current focus, selection, semantic brief freshness, truncation, and any ambiguity making deictic speech unsafe.
- [ ] #2 Loading, fresh, stale, ambiguous, truncated, unbound, unavailable, prior-epoch, stopped, and child-exit states are explicit and never retarget to the newly focused pane.
- [ ] #3 Focus changes consume ephemeral context, board changes consume SemanticContextEvent, and each restarted voice session shows one fresh brief rather than replaying idle deltas.
- [ ] #4 Tests at src/ui/voice-context/tests cover every state, exact identity, time/freshness boundaries, focus/selection changes, screen-reader naming, both themes, and no board snapshot/write.
<!-- AC:END -->
