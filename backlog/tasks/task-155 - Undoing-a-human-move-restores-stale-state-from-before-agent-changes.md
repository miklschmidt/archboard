---
id: TASK-155
title: Undoing a human move restores stale state from before agent changes
status: To Do
assignee: []
created_date: '2026-09-06 23:01'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 307000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by the user on 2026-09-07; not yet independently reproduced.

Reproduction:
1. An agent adds or changes a box on the board.
2. The person moves that box on the canvas.
3. The person presses Ctrl+Z.

Actual: undo restores the box to a state from before the agent touched it, instead of only reversing the person's move. This can undo accepted agent work as a side effect of an ordinary human undo.

Expected: the first undo returns the box to its state immediately after the agent's changes and before the person's move. An agent-created box must remain present. The affected workflow is a person refining an agent-edited diagram; undo must reliably reverse their own latest action without unexpectedly reverting the agent's work.

The cause is not established. Do not treat the earlier version-refusal fixes or a particular Excalidraw capture setting as a confirmed cause.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After an agent creates a box and a person moves it, one Ctrl+Z restores its post-agent position and preserves the box and its agent-authored properties.
- [ ] #2 After an agent modifies an existing box and a person moves it, one Ctrl+Z reverses only that move, preserving the agent's modifications; redo reapplies the person's move without reverting agent work.
- [ ] #3 A focused real-browser regression covers agent creation and modification followed by human move, undo and redo, verifying the resulting canvas and persisted note agree; ordinary human undo/redo remains functional.
<!-- AC:END -->
