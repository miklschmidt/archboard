---
id: TASK-482.05
title: >-
  archboard check warns when a container draws a relationship to a part inside
  it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 22:18'
labels:
  - semantic-model
  - skill
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
type: feature
ordinal: 846000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the Archboard server board, the container drew relationships to its own parts. In the Moving a pane view, a reader saw lines run from a box into itself and could not tell what they meant. The nesting already says that a container holds its parts. A call that runs inside a container starts at the part that makes it. The overview hides these lines (ADR 0052), but every view that opens the container draws them. Nothing told the agent that wrote them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check` warns when a relationship of a board current variant joins a container and a part anywhere inside it, in either direction, and names the board, the relationship ends and the fix
- [ ] #2 A relationship between two parts of one container, or from a container to a part outside it, is not warned
- [ ] #3 The archboard skill tells agents to start a call inside a container at the part that makes it
- [ ] #4 No dogfood board current variant carries the warning
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the warning beside OVERVIEW_CROWDED in src/runtime/semantic-board-store/lib/diagnostics.ts, one per relationship that joins a node and its ancestor.
2. Extend the overview store test with a board that holds one such relationship in each direction and one between siblings.
3. Add the rule to the skill and a line to ADR 0052.
4. Run archboard check on the dogfood vault and repair any board that warns.
<!-- SECTION:PLAN:END -->
