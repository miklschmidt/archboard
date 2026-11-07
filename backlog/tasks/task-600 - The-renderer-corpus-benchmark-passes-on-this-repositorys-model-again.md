---
id: TASK-600
title: The renderer corpus benchmark passes on this repository's model again
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T23:49:00Z'
updated_date: '2026-11-07T23:50:00Z'
labels:
  - renderer
dependencies: []
documentation:
  - >-
    docs/adr/0063-blocks-plans-placement-ports-labels-and-trunks-before-routing.md
type: bug
ordinal: 1037000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The opt-in benchmark (`bun run benchmark`, `packages/renderer/tests/runtime/blocks/operations/wide-pictures.test.ts`) failed 3 of 220 cases on main. Camera and pointer and Canonical architecture drew a crossing with no arc: a Blocks route looped back across a trunk that it draws itself, which the hop pass cannot see, because it never pairs two runs of one route. Camera and pointer has failed since #49 and Canonical architecture since #61. The root failed "arcs crowding each other or a junction" from #46, which changed only the model. Its first layout also stood at 2.9 s against the 3 s local limit, so it failed on a busy machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No Blocks route crosses, touches or runs along its own ink, and a unit test covers a looping route and a hairpin
- [x] #2 A label never lies over another stretch of its own route, also when it falls back to a spot beside them, and unit tests cover a hairpin with room beside and one without
- [x] #3 The arc reader of the corpus checks reads two flat-topped arcs on one line, with a straight run between them, as two arcs, and a test covers it
- [x] #4 `bun run benchmark` passes all 220 cases, and the root's first layout stays well inside its 3 s local limit
- [x] #5 Only the pictures that had the defect change, and every other corpus picture is byte-identical to main
- [x] #6 ADR 0063 states both rules
- [ ] #7 The owner accepts the two changed pictures by eye
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refuse a route that meets its own ink in the per-route guard (`channel::basic`), so every candidate, repair and the final guard refuse it.
2. Keep the label fallback beside its own other stretches but never over them (`route_labels`), also for a plate that contraction carried along.
3. Read two flat-topped arcs on one line as two arcs in `drawn-crossings.ts`: a curve that ends an arc starts none.
4. Cut the root's first layout: weigh the pairs of parts that pull together once per grid search, and settle each dense grid once for every room.
5. Compare every corpus picture with main, look at the changed ones, and run the benchmark, the renderer tests, clippy and the type check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause of the two crossings: in Camera and pointer, IPiFENAY went down past its target row, round and back right along the y=1006 target trunk across its own descent. In Canonical architecture, AjGkFCES went up, round and back along the y=939 trunk across its own start. Both loops gave the label a private run. `drawn_lines::crosses` skips two runs of one route, and the looping route draws both lines, so no crossing was found to hop.
With only the loop guard, Canonical architecture fell to a hairpin for 2PHWJ0zL: the repair step reinserted a fallback candidate whose words covered both legs, 32 px apart. The fallback (`slot_index`) ignored the route's own stretches. It now keeps 0.01 from them instead of 12, so the words may stand beside, never over.
The root's "arcs side by side" were a misreading in the test: two flat-topped arcs on one line with a straight between them read as one long arc, because the curve that ends the first was also taken as the start of a dip. The drawing was right.
Speed: callgrind put 55% of the root in `dense::grid::Grid::cost`, which compared door and group names as strings for every pair at every swap. The pair weights are now computed once per search, and the grids settle once for every room, since the room does not change them. Both keep the sums in the same order, so the pictures are byte-identical.
Measured against main in this worktree, rendering all 110 Blocks readings: 108 byte-identical, Camera and pointer and Canonical architecture changed. Root 2938 -> 1743 ms, Commands 267 -> 107 ms, Canonical architecture 381 -> 614 ms (its labels search further), all readings 12.9 -> 12.2 s.
Canonical architecture now takes another placement: three columns in the frame instead of two, 2880x1660 instead of 2321x1816, 13% more area. Camera and pointer grew 54 px taller.
Checks: benchmark 220/220 in five runs, root 1.83-1.87 s at load 4.3; renderer package tests 829/829; archboard-layout tests 144/144; clippy for wasm32, rustdoc, cargo fmt, tsc, lint:tests and fmt clean.
<!-- SECTION:NOTES:END -->
