---
id: TASK-559.09
title: Remove the dead space that the content rules leave
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
updated_date: '2026-11-08T06:52:00Z'
labels:
  - renderer
dependencies:
  - TASK-559.12
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 981000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner saw obscene dead space in Blocks. The content rules remove most of it, so renderer work must start from what they leave, and it must keep every geometry guard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Local compaction and candidates ranked by fit are measured on the merged core and on the content of the design
- [x] #2 Names, paths, arrows and essential labels stay readable, and no reading regresses on a guard
- [ ] #3 The grading corpus of Gate 6 passes in the real pane
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure where the dead space lies on main: 34 M of the 40 M of blank page lies outside frames, round the cards that stand outside an open frame (doors).
2. Replace the ring's fixed wall capacity with a cost: each door takes the wall where the way of every line, times what the page's room costs, is least. Search greedily in regret order, then move doors while a move lowers the cost.
3. Share one room cost between the ring, the placement promise and the order of finished drawings: the page's area plus the pane-shaped room it needs past the landing room.
4. Route two dense placements of a framed reading past 15 lines, because the promise misses the crossings that doors bring.
5. Prove it with a ring test that fails on the old ring, the full corpus measure against main, real pictures in both themes, the benchmark and the check lanes. Amend ADR 0063.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compaction landed through feat/blocks-dead-space: Gate 1 113 of 115 at 135.9 M from 94 of 115 at 192.9 M, frames below fill 0.25 fell from 42 to 5. Gate 4 passes, Stock API 0.708.

Ring of doors (fix/blocks-dead-space). On main, 34 M of the 40 M of blank page lay outside frames: the old ring gave each wall a fixed capacity, so a door that did not fit went to the next cheapest wall, often a lone side column or the far wall. Each door now takes the wall where the way of every line plus the drift of its line-up, times the page's room cost, is least. One room cost (area plus the pane-shaped room past the landing room) now ranks the ring, the placement promise and the finished drawings. Framed readings past 15 lines route two dense placements.

Measured on this repository's 107 readings through the real renderer in the 1231 by 955 landing room (LANDING_ROOM; the 1063 by 955 of the design record is stale): fit 0.6 or more 96 (main 69), page area 175.2 M (190.3 M), blank space 28.4 M (39.9 M), card share 0.246 (0.227). Crossings rise 3.6 percent, route length 1.2 percent, bends 1 percent. Routes through cards and labels off runs stay 0. 61 readings land at least 0.05 larger; four land smaller and stay at 0.70 or more (Model access 0.99 to 0.74, archboard-paint 0.97 to 0.84, Batch and inputs 0.82 to 0.71, Walkthrough recording 0.79 to 0.74), because the order now prefers their three-column frames with fewer crossings. The root is byte-identical. Gate 6: Browser 0.45 to 0.59 (crossings 125 to 149), model 0.42 to 0.61, root unchanged; Workspace packages and Command startup no longer exist. Layout of all readings takes 18.1 s against 10.4 s, mostly from the second route; the root stays at 1.9 s.

Rejected trials: an extra charge on a door's way past its nearest wall cut crossings below main but scattered doors on Canonical edit operations; dropping the frame's inner way from the ring cost shortened routes but put lone side columns on Camera and pointer and workspace.

The attention browser owner walked only the first line of the Fanout picture and picked the point on Hub's wall. Hub now stands between its cards, so it searches every line, away from the cards, for the most shared stretch. No architecture proposal: the change stays inside the Blocks dense placement and changes no module or relationship.

AC2 evidence: bun run benchmark passes 220 of 220 with its drawing assertions and speed limits. The scorecard keeps routes through cards and labels off runs at 0. The camera's far view sets card words at 18 px below 12/14 scale, so a name reaches 12 px at any landing of 12/18 or more; no reading newly lands below it, and 24 readings do against 42 on main. bun run check passes every lane except the attention browser owner, which passes on its own after its fix. AC3 waits for the owner's grade of Browser, model and the root (Workspace packages and Command startup no longer exist).
<!-- SECTION:NOTES:END -->
