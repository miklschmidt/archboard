---
id: TASK-538.05
title: A picked container shows its interface measures on each proposal side by side
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T05:08:00Z'
labels:
  - compare
  - ui
dependencies:
  - TASK-538.01
parent_task_id: TASK-538
type: feature
ordinal: 946000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0044 allows the interface measures of competing proposals side by side, and semantic compare --beside answers them in the CLI. In the browser, a container shows the measures of the variant on screen only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A picked container shows one row for each variant of the board: current, each draft and each shelved variant, with the five interface measures
- [ ] #2 The numbers equal those of semantic compare --beside
- [ ] #3 The variant on screen is marked, a shelved row carries its reason, and a variant where the node holds no parts or draws no caller says so
- [ ] #4 Nothing is scored, ranked or highlighted as better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
A picked container's Selection tab gains a region with its interface measures on each variant of the board.

1. components/semantic-board-canvas/InterfaceOnEachVariant.tsx (new): for a part that holds parts on any current, draft or shelved variant of a board with two or more of them, one row per variant: the current one first, then drafts and shelved ones in the board's order. Each row has the variant's mark and name, the five measures (entry points, hidden parts, callers, outgoing, pass-through) read by inspectContainer and interfaceMeasures from that variant's own content, as semantic compare --beside reads them (criteria 1 and 2). The variant on screen says On screen, a shelved row carries its shelving reason, a variant where the part holds no parts says so instead of the counts, and one with no caller says it draws no caller (criterion 3). Rows keep the board's order, and no count, row or variant is coloured, scored or marked better (criterion 4).
2. SemanticInspector passes the board it read through InspectorBody to DetailsPanel, which renders the region after ContainerInterface.
3. Test: a rendered test over a board with a current, a draft and a shelved variant: the rows, their counts against semantic compare --beside's derivation (the CLI's measuredInterfaces on the same document), On screen, the shelving reason, holds no parts and draws no caller.
4. docs/design/operator-canvas-shell.md: the Selection tab's interface question names the region.

Proposal: Board viewer@TASK-538.05 adds the part Measure each variant, rendered by Render stage states.
<!-- SECTION:PLAN:END -->
