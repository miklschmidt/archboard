---
id: TASK-482.05
title: >-
  archboard check warns when a container draws a relationship to a part inside
  it
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 22:18'
updated_date: '2026-10-15 22:35'
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
- [x] #1 `archboard check` warns when a relationship of a board current variant joins a container and a part anywhere inside it, in either direction, and names the board, the relationship ends and the fix
- [x] #2 A relationship between two parts of one container, or from a container to a part outside it, is not warned
- [x] #3 The archboard skill tells agents to start a call inside a container at the part that makes it
- [x] #4 No dogfood board current variant carries the warning
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the warning beside OVERVIEW_CROWDED in src/runtime/semantic-board-store/lib/diagnostics.ts, one per relationship that joins a node and its ancestor.
2. Extend the overview store test with a board that holds one such relationship in each direction and one between siblings.
3. Add the rule to the skill and a line to ADR 0052.
4. Run archboard check on the dogfood vault and repair any board that warns.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: the store test in overview-budget.test.ts warns a line each way between a container and a part inside it, and leaves a line between siblings and one from outside unwarned. Lint, format, type-check and the repository lane passed. Before the boards were adopted, archboard check warned on three current lines (Archboard server: Codex workbench -> Archboard server; Board viewer: Render stage states -> Semantic viewer and Semantic viewer -> Picture traffic). The TASK-482.04 drafts held none, and after their adoption archboard check reports no diagnostics. Removing those lines uncovered three real calls on Board viewer that the code check reported as RELATIONSHIP_UNDRAWN, and TASK-482.04 drew them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check warns CONTAINER_LINE_TO_OWN_PART on each relationship of a current variant that joins a container and a part inside it, in either direction, naming the relationship and the fix. The skill and ADR 0052 state the rule. Verified with a store test and a run on the dogfood vault, which reports no diagnostics.
<!-- SECTION:FINAL_SUMMARY:END -->
