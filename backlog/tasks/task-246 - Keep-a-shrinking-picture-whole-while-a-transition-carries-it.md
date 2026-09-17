---
id: TASK-246
title: Keep a shrinking picture whole while a transition carries it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-16 19:30'
updated_date: '2026-09-17 07:30'
labels:
  - frontend
  - bug
dependencies: []
references:
  - src/ui/semantic-board-canvas/lib/picture-transition.ts
  - src/ui/semantic-board-canvas/components/SemanticDiagram.tsx
ordinal: 432000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Between two pictures of one board, a transition stages the target SVG on the surface at its first frame, with the target page width, height and viewBox, and animates the old geometry inside it. When the target page is smaller, whatever of the old picture lies beyond the new bounds is cut off from the start of the transition rather than at its end. Seen by the user on 2026-09-16 moving between the Semantic renderer board variants (Current architecture 1062x987, Readable layout 1435x989), where page sizes now differ more because layout chooses flank rules per board (TASK-245.08). Introduced with the transitions of TASK-234.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 During a transition between two pictures of one board, nothing of either picture is clipped by the page bounds of the other
- [ ] #2 When the transition lands, the surface and picture are exactly the target picture as the server drew it, sized to the target page
- [ ] #3 A picture-transition test owns the no-clipping behaviour for a target page smaller than the source
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. While a transition is in flight, let the staged picture draw outside its own page box, so the old geometry beyond a smaller target page is not clipped by the SVG viewport.
2. Landing restages the server's picture untouched, which ends the override at the end of the transition.
3. Own it in picture-transition.test.tsx: a smaller target keeps both pictures unclipped in flight and lands exactly as drawn.
4. Look at the transition in the running canvas; record it only if awkward movement remains.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-17: the user reported the board still moves when switching Semantic renderer between Current architecture and Readable layout. Recorded headless over CDP. Two causes. (1) Readable layout's page is 1600x1125 against 1062x987, with a lane added on the left, so every shared card sits about 140 px right and 60 px down on the new page, and the camera stayed pinned to the page corner. (2) A second answer with the identical SVG arrived about 30 ms into the transition and landed it after one frame, so the move read as a jump. Fixed in 3a commit on task-247-browser-render: the camera follows the shared cards' mean centre shift before first paint (no CSS easing), the new picture starts that far back and eases home with the card motion, and the same SVG arriving again no longer lands a flight. Tests: picture-transition.test.tsx (shift start/ease/landing, camera told the shift, same picture mid-flight keeps flying). Recordings: ~/.claude/jobs/3103d28b/tmp/motion/before.mp4 and after.mp4.
<!-- SECTION:NOTES:END -->
