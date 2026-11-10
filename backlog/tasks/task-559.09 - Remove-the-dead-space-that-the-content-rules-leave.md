---
id: TASK-559.09
title: Remove the dead space that the content rules leave
status: Done
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
updated_date: '2026-11-10T15:51:00Z'
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
- [x] #3 The grading corpus of Gate 6 passes in the real pane
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure where the dead space lies on main: 34 M of the 40 M of blank page lies round the cards that stand outside an open frame (doors).
2. Price each dense placement by one stated cost (line sketches, crossings, group spread). Search the parts with annealing, and stand the doors with an exact ring program that pays for the pane its box leaves blank.
3. Rank finished drawings by whether they read, then by long detours on a page that reads, then by route cost, crowded approaches, blank space from three quarters of the room, and twice the blank pane.
4. Stand three frames or more in rows, or in stacks that end level.
5. Split a dense solve into parts across the layout workers, with the same answer as one solve (ADR 0078).
6. Prove it with focused tests, the 109 readings and a corpus of 172 readings with several frames open against main, real pictures in both themes, the benchmark and the check lanes. Amend ADR 0063.
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

Strips and test fixes (2026-11-10). The owner said that wide thin strips are the main layout problem, because they are unreadable on normal monitors. Main draws no page of the corpus more than 2.5 times as wide as tall, and an earlier head of this branch drew 16. A finished drawing now pays for the pane that it leaves blank from full scale down, by how far the page grows past the landing room. The door ring pays for the same blank by its square, so it offers a page of the pane's shape. Blank space counts only as a page grows from three quarters of the landing room to the whole room, because space on a smaller page makes no word land smaller. Frame titles and group captions count as ink.

Three renderer tests that pass on main failed on this branch, and they pass again. A line between two doors pulls each door toward where the other stands. A frame's own line to a card outside it is sketched from the frame's tab. If two facing ports stand less than two bend radii apart, the end that holds its port alone lines up, so the line runs straight.

Corpus of 109 readings through the real renderer against main: crossings 3618 to 2798, route length 1334.8k to 1157.9k, bends 232.0 to 209.5, page area 181.8 M to 161.6 M, blank space 39.9 M to 28.5 M, readings at 0.6 or more 93 to 99, mean landing 0.819 to 0.849. Routes through cards and labels off runs stay 0. Four pages are wider than 2.5 to 1: three land at 0.94 or more, and Painting lands at 0.38 against 0.42 on main. bun run check passes every lane, and bun run benchmark passes 224 of 224.

The site's Checkout API and Inventory service diagrams were drawn again. The site audit found that the walkthrough player, the pipeline, the drill-down and the documents tiles show them whole, with each ring and highlight on its part. Four fixes of older site mocks wait on branch fix/site-renderer-shell-audit.

Sol reviewed five rounds on gpt-6.1-sol at xhigh. Round 4 approved the test fixes and agreed to reverse S1. Round 5 asked to charge the blank pane by the scale lost instead of by the growth past the landing room (S5). That was declined, because the corpus measured the growth form, and the ADR now describes the code.

Speed after the strip fix: one solve in WebAssembly takes a mean of 377 ms, a median of 220 ms, a p90 of 930 ms and a max of 2441 ms. Through a pool of six workers the wait is a mean of 120 ms, a median of 68 ms, a p90 of 277 ms and a max of 955 ms, with the same 105 answers as one solve. The two slowest readings rose from about 1.6 s to 2.4 s in one solve, because they now try more drawings.

Frames in stacks (2026-11-10). The owner opened HTTP serving with six groups open and found tall blank holes beside the short frames. Three frames or more stood in rows, and each row was as tall as its tallest frame. The readings of this repository's model open one frame each, so the corpus never reached this code. A second corpus opens every door of each scope: 172 readings of 3 to 14 frames. The stacked placement now stands three frames or more in stacks side by side, shared the way that lands the whole largest (every partition up to 8 frames, else the shortest stack). A page that does not read counts no long detours. On the 172 readings natively, earlier head to now: mean landing 0.272 to 0.288 (92 land larger, 38 smaller), area 3617.7 M to 3171.5 M, blank 1185.5 M to 947.3 M, crossings 136287 to 132270, strips 2 to 0, slowest solve 68.7 s to 28.6 s. Main lands them at 0.251 with 15 strips and 203095 crossings. HTTP serving with six groups open, real renderer: 3590 by 2876 px at 0.33 to 3126 by 2615 at 0.36, card share 0.149 to 0.186, crossings 135 to 134, 1.4 s. The 109 single-frame readings through the real renderer: 3 change, crossings 2798 to 2837, blank 28.5 M to 27.5 M, landing at 0.6 or more stays 99. Tried and dropped: a fixed stack count, the count picked by the sketch cost (twice as slow), and a local search in place of every partition (more crossings than before). One reading fails to draw on main and on the earlier head with no clear planned channel: TASK-624.

Gate 6 (2026-11-10): the owner graded the readings in the real pane on the worktree server, with the frame stacks, and approved.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Blocks pictures of a reading with open frames now pack their cards, frames and doors without the wide blank margins, strips and tall holes they left. A dense placement is priced by one stated cost and searched, the doors stand round the frames by an exact program, finished drawings rank by readability, detours on readable pages, route cost and blank space, and three frames or more stand in rows or in stacks that end level. A dense solve splits across the layout workers with the same answer. On this repository's 109 readings against main: crossings 3618 to 2837, blank space 39.9 M to 27.5 M, readings landing at 0.6 or more 93 to 99. On 172 readings with every door open: mean landing 0.251 to 0.288, strips 15 to 0. One WebAssembly solve averages 381 ms against 81 ms on main, and a pool of six workers waits 123 ms on average. bun run check and the benchmark (224 of 224) pass. Risks: a solve costs more processor time than on main, and Painting still draws as a wide strip at 0.38. Follow-up: TASK-624, a fallback that throws when no planned channel is clear.
<!-- SECTION:FINAL_SUMMARY:END -->
