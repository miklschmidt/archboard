---
id: TASK-538.01
title: >-
  A proposal's Board tab says first what it changes about each container's
  interface
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:05:00Z'
updated_date: '2026-10-25T17:41:00Z'
labels:
  - compare
  - ui
dependencies: []
parent_task_id: TASK-538
type: feature
ordinal: 942000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first slice of TASK-538. An interface change costs every caller, so ADR 0044 puts interface changes before other changes in a comparison. The CLI does so. The browser shows only counts of added, changed and removed subjects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a variant read against another, the Board tab lists each container whose interface changed: entry points added and removed, parts that moved between the interface and the hidden parts, and callers gained and lost
- [ ] #2 The list holds exactly the containers and parts that semantic compare lists as interface changes for the same two variants
- [ ] #3 The list stands after the summary and before the counts of the comparison
- [ ] #4 If no interface changed, the region says so, and the current variant shows no region
- [ ] #5 Choosing a row picks the part, pointing at a row lights it, and no comparison status changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board: Board viewer@TASK-538.01, branched from TASK-537.01, adds List interface changes under Stage and reads (InterfaceChanges.tsx), rendered by Render stage states and fed by Resolve board meaning (interfaceChangesOf). No other board is affected: the derivation is compareInterfaces in packages/board, which semantic compare already uses.
2. rules/semantic-board-canvas/board/board-document.ts: the reading gains contentOf(variant), and interfaceChangesOf(reading, against) returns compareInterfaces(against, on screen).changed.
3. components/semantic-board-canvas/InterfaceChanges.tsx: under the Compared with heading and before the counts, one block per changed container with a row per moved part (entry point added or removed, now an entry point, now hidden, caller gained or lost). A container on one side only says so. No change says so. Rows light on hover and show the part when chosen; nothing sets a comparison status. SemanticChanges takes it as children.
4. Tests: a rendered stage-harness test on a draft read against current (rows by container, part and move; no change; current shows none; choosing picks).
5. Docs: the Board tab region 1 text in operator-canvas-shell.md and the Changes section of pane-sidebar-hierarchy.md.
<!-- SECTION:PLAN:END -->
