---
id: TASK-434
title: >-
  The mark of a card that opens another board stands in the same place from far
  and from near
status: Done
assignee: []
created_date: '2026-10-06 23:28'
updated_date: '2026-10-07 01:59'
labels: []
dependencies: []
ordinal: 789000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The mark in the top-right corner of a card, which says that the card opens another board, changes place when the picture swaps between its near and its far view. Near, it stands level with the middle of the kind chip and a card padding in from the right. From far away, it stands 1.2 times larger, a radius and a half in from the top and the side. The owner wants it to stand at one offset from the top and the right of the card in both views, further in than the far view has it now and less far in than the near view has it now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The mark of a card that opens another board has its centre at the same distance from the card top and the same distance from the card right edge, near and far
- [x] #2 That distance is larger than the far view had it before (11.7 units) and smaller than the near view had it before
- [x] #3 The same holds for a container header, for a card on a sequence diagram and for a card measured by the other layout engine
- [x] #4 The words of a card still stop short of the mark, and a card that wears the warning badge still keeps the mark clear of it
- [x] #5 A renderer test holds the mark at one centre in both views
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The mark now stands at one place near and far. Its centre is 16 units in from the top edge and 16 units in from the right edge of a card, of a container header slab and of a sequence card, with both layout engines. cornerDrillMark in lib/svg/drill-mark.ts is the one place that decides it, with the constant DRILL_MARK_INSET. paintCardViews draws the mark in the near layer and in the far layer from that one function. farMark, drillCorner, BADGE_GAP, BADGE_DEPTH and the lower place under the warning badge are gone. The far mark is still 1.2 times larger, about the same centre. A half-and-half blend of the two views reads as one ring that grows, not as a jump. The ring stays about 3 units clear of the warning badge at the far size and about 4.4 units at the near size. The room the words keep (DRILL_MARK_ROOM) is unchanged and still keeps the words short of the ring. Before the change: near 22.5 from the right and 28 from the top on an architecture card or header, 19.5 and 18.6 on a sequence card with a note, far 11.7 and 11.7, or 17.9 from the top under the badge. drill-marks.test.ts now holds one centre near and far, as far from the top as from the right, on the card and clear of the badge, for track, blocks and data-flow, settled and unsettled.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Drill marks keep one center sixteen units from the top and right edges in both views. Rendered owners pass across headers, sequence participants, and both engines. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
