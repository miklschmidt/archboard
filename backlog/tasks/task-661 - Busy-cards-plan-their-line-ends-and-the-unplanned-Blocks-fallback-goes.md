---
id: TASK-661
title: Busy cards plan their line ends, and the unplanned Blocks fallback goes
status: To Do
assignee: []
created_date: '2026-11-22T02:39:00Z'
labels: []
dependencies: []
references:
  - crates/archboard-layout/src/blocks/place.rs
  - crates/archboard-layout/src/blocks/planned/model.rs
  - >-
    docs/adr/0063-blocks-plans-placement-ports-labels-and-trunks-before-routing.md
ordinal: 1142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-624 made a Blocks reading that the planner refuses fall back to the older placement, marked unplanned, so it draws instead of failing. The owner rejects that fallback: it runs only after the planner has tried every placement (about 22 s for this repository's 18 packages) and draws loose. The cause is that a busy card's walls (all four on a card; a frame's tab foot takes only its bottom) hold too few line ends in a crowded reading, so every placement is refused. Fix the cause, then delete the fallback (replace, don't layer).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reading whose cards need more line ends than their walls hold today plans instead of being refused, including this repository's 18 packages in one focus
- [ ] #2 The unplanned fallback of TASK-624 and its unplanned marking are deleted, with their tests
- [ ] #3 The render corpus shows which drawings change, and none fails
- [ ] #4 A focused test at the planner's seam covers a card whose line ends outnumber what one wall held before
<!-- AC:END -->
