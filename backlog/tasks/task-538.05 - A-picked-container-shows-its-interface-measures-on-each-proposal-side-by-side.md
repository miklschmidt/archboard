---
id: TASK-538.05
title: A picked container shows its interface measures on each proposal side by side
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T05:24:00Z'
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
- [x] #1 A picked container shows one row for each variant of the board: current, each draft and each shelved variant, with the five interface measures
- [x] #2 The numbers equal those of semantic compare --beside
- [x] #3 The variant on screen is marked, a shelved row carries its reason, and a variant where the node holds no parts or draws no caller says so
- [x] #4 Nothing is scored, ranked or highlighted as better
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification:
- bun run check passed (12 of 12 lanes, no failing test).
- Browser QA in the dark theme at 1920x1080 on the Checkout and orders example (take server over examples/web-shop): Orders picked in both panes shows On each variant with Initial 1, 2, 2, 0, 1 (On screen), One entry point 1, 2, 2, 0, 0, Entry per job 3, 0, 2, 0, 0 and, after the dock agent branched it, Validate then submit 2, 1, 2, 0, 1. semantic compare --variant 'Validate then submit' --beside 'One entry point' --beside 'Entry per job' answers the same five counts for each variant. After the agent shelved Entry per job, its row carries the shelved mark and 'Shelved: three entry points make every caller learn the order rules.'
- The rendered test owns holds no parts and draws no caller.
- No row, count or variant is coloured, scored or marked better: the only mark is On screen.

Board closing:
- archboard check --code: 41 findings with and without --variant TASK-538.05; the proposal adds none and clears none.
- Footprint against base 817a456b3: namedAndChanged Measure each variant and Render stage states; changedNotNamed and namedNotChanged empty. Skipped: three drill-downs (Browser client, Draw here, Archboard server), where the task has no proposal, and four unbound parts.
- The proposal's summary was set to the board's scope, then Board viewer@TASK-538.05 was adopted at version 161. archboard check reports no diagnostics, and no board is behind because of commit 8b6203399.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A picked container's Selection tab gains On each variant: one row for each current, draft and shelved variant of its board, with the five interface measures read by the same inspectContainer and interfaceMeasures that semantic compare --beside uses. The current variant comes first, the variant on screen says On screen, a shelved row carries its reason, and a variant where the part holds no parts or draws no caller says so. Nothing is ranked. A rendered test owns the rows; browser QA matched the CLI on four variants; the gate passed. Board viewer@TASK-538.05 is adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
