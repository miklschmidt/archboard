---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:41'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.03
  - TASK-144.07
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-composer
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own Archboard composer controls in `src/ui/workbench-composer` using assistant-ui composer primitives. No assistant-ui Element is copied; explicit closed capabilities determine submit, steer, Stop, and draft behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Empty draft, editing, disabled, submitting, queued, steering, awaiting response, stopping, interrupted, completed, recoverable failure, reconnecting, invalidated, and terminal failure are visibly and programmatically distinct.
- [ ] #2 Submit starts the exact idle link, Steer names the permitted active turn, and Stop names the active turn; no focus or recent-event heuristic can retarget after pane changes.
- [ ] #3 Recoverable failure preserves the draft, authoritative success clears it, invalidation freezes input, and every disabled action explains the recovery path.
- [ ] #4 Tests at src/ui/workbench-composer/tests cover capability/state transitions, keyboard shortcuts, focus return, labels/status, busy semantics, duplicate submission refusal, and pane-focus changes.
<!-- AC:END -->
