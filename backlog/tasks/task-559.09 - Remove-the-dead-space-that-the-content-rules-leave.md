---
id: TASK-559.09
title: Remove the dead space that the content rules leave
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
updated_date: '2026-11-10T03:17:00Z'
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

Owner review fixes (fix/blocks-dead-space, 2026-11-08). A door on a side wall that reached past a corner stood over a door above or below the frame; it now steps outward until it clears them (ring test). A fan junction keeps 36 px from every arrowhead at its shared end, also at a source where a two-way line draws one; contraction keeps the same room. A label that finds no spot wraps onto a narrow plate (about 120 px, never narrower than its longest word) before it stands beside its line or its line goes a longer way; this removed the skills detour in the model reading. Two lines that meet one card wall side by side and cross just beside it trade ports when that removes a crossing and passes the finish guards. The renderer lessons are in skills/archboard-renderer.

Corpus of 107 readings against main: crossings 4376 to 4140, route length 1493.2k to 1388.5k, page area 190.3 M to 167.5 M, blank space 39.9 M to 27.1 M, fit 0.6 or more 69 to 98, bends 227.4 to 216.9; routes through cards and labels off runs stay 0; no card overlaps another in any reading. Near-port crossings 20 to 3. Layout of all readings takes 13.8 s (main 10.4 s, this branch before the wrap 19.4 s). Wrapping changes the winning placement of some readings: Model reading, Pane connections and Codex session now land larger with more crossings, because the ranking weighs room over crossings; a trace showed the same placements compete. bun run benchmark passes 220 of 220.

Final head after the review fix that lets trunk words wrap too: crossings 4168 (main 4376), route length 1385.9k (1493.2k), page area 166.8 M (190.3 M), blank space 26.9 M (39.9 M), fit 0.6 or more 98 (69), junctions closer than 26 px to an arrowhead 0 (19), near-port crossings 3 (32), overlapping cards 0. These replace the figures in the note above. Sol approved in round 2, and CI passes on the PR.

Speed (2026-11-10). The owner asked for render times near 500 ms on average, with no change to the layout. Exact changes in the dense search, the door ring, the sketches and the router keep every answer byte-identical: the 104 native and 105 WebAssembly hashes stay the same at each step. One solve in WebAssembly takes a mean of 362 ms (683 before), a median of 221 ms (386), a p90 of 912 ms (1930) and a max of 1621 ms (3530). Main takes a mean of 81 ms.

ADR 0078 lays a dense solve out in parts across the layout workers. The pool splits a solve when it has two workers or more and no other solve is under way. Through a pool of six Bun workers, the wait for one picture is a mean of 116 ms, a median of 65 ms, a p90 of 273 ms and a max of 981 ms, with the same 105 hashes. Processor time over the corpus rises from 38 s to 50 s.

Frames in rows. A module with its six groups open drew its seven frames in one row, 10609 by 1044 px, which landed at 0.12. Three frames or more now stand in the rows that land them largest on 0.6 of the readable page's width. That reading now lands at 0.33 in 3566 by 2868 px, and its crossings fall from 167 to 135. No corpus reading has more than one frame, so the corpus does not change. Eight variants of that reading measured the change.

Shell. The wait notice in a reading shows a small animated picture, and it is the one sign of the wait. DESIGN.md no longer bans looping motion or blur over the picture, at the owner's request.
<!-- SECTION:NOTES:END -->
