---
id: TASK-555
title: Blocks routes take fewer bends, so a reader can follow each line
status: To Do
assignee: []
created_date: '2026-10-28T01:02:00Z'
updated_date: '2026-10-28T01:03:00Z'
labels:
  - renderer
  - layout
dependencies:
  - TASK-554
ordinal: 968000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner saw very squiggly routing in Blocks drawings (2026-10-28, Command interface, What the CLI can be asked: the worst routes turn 8 times between two cards). Counted over the light, plain corpus of feat/faster-first-render after TASK-548.08 (4,123 Blocks routes in /tmp/council-r5/out2/runs/after/svg): 2.35 bends per route, and 28.5% of routes turn four times or more. Track has 2.02 bends per route and 23.1%. The parent c147b73c8 had 2.33 and 28.0% in Blocks, so the squiggles come from the Blocks router, not from TASK-548.08. Bends weigh on the council's R (short, direct relationships, weight 25) and T (traceable lines, weight 18), which come after K (compactness, TASK-554) in the owner's order. The compactness measures in packages/renderer/tests/runtime/support/drawn-compactness.ts count route length and detour but not bends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The compactness measures report bends per route and the share of routes with four or more bends, for a saved corpus and between two corpora
- [ ] #2 Blocks bends per route and the share of Blocks routes with four or more bends both fall over the complete corpus
- [ ] #3 On a fresh blind sample judged against the base branch, the council's mean R and T scores of the after pictures are not lower than of the before pictures, no pair is worse, and no after picture has a new defect
- [ ] #4 Every hard check of expectDrawingIntact passes on the complete corpus and every whole board
- [ ] #5 First and growing-edit renders of Board viewer, Board persistence and Archboard server routes stay under 500 ms on a quiet machine
- [ ] #6 Every Track drawing of the corpus is byte-identical to the base branch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-28, the owner: leave the Track engine as it is and work on Blocks exclusively. The council samples Blocks drawings only, and Track drawings stay byte-identical.
<!-- SECTION:NOTES:END -->
