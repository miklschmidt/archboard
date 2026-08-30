---
id: TASK-140.05
title: Focus the canvas on the selected connected architecture path
status: To Do
assignee: []
created_date: '2026-08-30 02:31'
labels: []
dependencies:
  - TASK-140.04
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: medium
type: feature
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let a person reduce a busy board to the architecture path connected to one selected element. The inspector starts a temporary focus state that follows real Excalidraw arrow bindings, keeps the connected component at full emphasis, and dims unrelated content. This is browser view state only; it must not rewrite the board, manufacture semantic dependencies, or enter the change feed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For one selected element, an explicit inspector action enters focus and keeps the selected element, every element transitively connected through canonical arrow endpoint bindings, the connecting arrows, and their bound labels at full emphasis
- [ ] #2 Unrelated elements are visibly de-emphasized in both themes without becoming unselectable or changing their stored appearance
- [ ] #3 Changing the selection recomputes focus from the current board, clearing selection or leaving the board exits focus, and a visible control plus Escape exits focus directly
- [ ] #4 Cycles terminate, arrows with a missing or invalid endpoint do not create a connection, and empty or non-connectable selections return a clear no-path result
- [ ] #5 Entering, updating, and leaving focus produce no board note write, no agent change-feed entry, and no persisted or exported element difference
- [ ] #6 Deterministic graph tests and rendered browser coverage prove direct and transitive connections, cycles, broken bindings, bound labels, theme contrast, selection changes, and zero scene mutation
<!-- AC:END -->
