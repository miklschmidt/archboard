---
id: TASK-600
title: The renderer corpus benchmark passes on this repository's model again
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T23:49:00Z'
updated_date: '2026-11-08T04:25:00Z'
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
- [x] #5 Contraction keeps the room a join needs before its card and stands a crossing at exactly its least room, so it takes the unused room out of Canonical architecture again, and a unit test covers the join
- [x] #6 Crossings that a crest would crowd form one cluster, and a unit test covers it
- [x] #7 Against #66, the notes list every corpus picture that changes, with its size, and every other picture is byte-identical
- [x] #8 ADR 0063 states the loop rule, the label rule and the join room that contraction keeps
- [x] #9 The owner accepts the changed pictures by eye
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refuse a route that meets its own ink in the per-route guard (`channel::basic`), so every candidate, repair and the final guard refuse it.
2. Keep the label fallback beside its own other stretches but never over them (`route_labels`), also for a plate that contraction carried along.
3. Read two flat-topped arcs on one line as two arcs in `drawn-crossings.ts`: a curve that ends an arc starts none.
4. Cut the root's first layout: weigh the pairs of parts that pull together once per grid search, and settle each dense grid once for every room.
5. Compare every corpus picture with main, look at the changed ones, and run the benchmark, the renderer tests, clippy and the type check.

6. On the owner's review: keep the join room and exact crossings through contraction, so Canonical architecture loses its empty top band.
7. Stack the branch on #66, and fix what its narrower navigator exposes in the corpus: crossings that a crest would crowd join one cluster.
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

Stacked on #66 (feat/shell-lit-table). Its narrower navigator changes the landing room, so 30 pictures differ from main before this branch.
Owner review: Canonical architecture had a wide empty band at its top. With the loop guard its tight rooms (96, 144) no longer route, so it drew at room 192, and contraction failed at every tight clearance, so the extra room stayed. Two guard rules refused the contracted drawing. Contraction kept only the 21 px approach between a card and the stretch where a line joins another line just before that card, but `junctions::readable` needs 36 px. And contraction stands a crossing exactly 16 px from a bend, which floating noise made `clear_crossing` refuse. Contraction now keeps `JOIN_ROOM` for such a stretch (`compact/sheet.rs` `joined_card`, `Piece::joins`), and the crossing rule allows 1e-6 of noise. Canonical architecture is 2787x1537 now, 2880x1660 before this fix, 2321x1816 on #66.
On #66 the root failed 'arcs side by side': crossings 20.04 px apart formed two clusters, and a crest over two crossings runs 3 px past them, so it stood 3 px from the next hop. Clusters now count that margin (`routes/clusters.rs`), and the three crossers hop the line one each. This changes only the root.
Against #66, 16 of 110 pictures change, 94 are byte-identical. Root 4209x3931 (hops only). 0T9enjhi#1VHRyajb (Canonical architecture) 2321x1816 -> 2787x1537. 0T9enjhi#Bd4GPG6d 2044x1510 -> 1907x1330. 0T9enjhi#ZRq51Ecz 1514x1179 -> 1514x1215. 0T9enjhi#Zeo3aQWz 2104x1513 -> 2050x1342. 0T9enjhi#cNaEpWjJ 2772x1742 -> 2710x1372. 6E6hL0Zk#9G6CmNgt 1988x1113 -> 2015x1089. 9ncuT5DP#Fg9dkGj3 1685x874 -> 1470x1083 (its frame now holds one column instead of a 2x2 grid). 9ncuT5DP#u2LFaG7R 2020x923 -> 1892x982. IbGtfJE2#8O4XNZOZ 1777x1235 -> 1756x1160. Oi6SBIAM#UvFpXmwp 1888x1554 -> 1798x1346. SMjRfwN3#ZAj4RMzN 1594x1500 -> 1546x1171. UOXNWLhR#ZSU6h9hV (Camera and pointer) 2093x1811 -> 2087x1347. XppR9owz#dHZeNcMs 1169x987 -> 1116x952. vKEsyHFk#OHywsFXm 2238x1402 -> 2193x1332. yejBBUFY#n2ONtqdt 2053x1340 -> 1990x1156. In total the changed pictures cover 8.5% less area. 9G6CmNgt changes under the loop and label rules although its picture on #66 shows neither defect: the guard also refuses candidates during the search, which then ends on another placement.
Checks on the stack: benchmark 220/220, root 1.97 s; renderer package tests 829/829; archboard-layout tests pass; clippy for wasm32, rustdoc and cargo fmt clean. Rendering all 110 readings takes 11.0 s, 21.5 s on #66 alone.

Review on gpt-6.1-sol at xhigh, in three scopes. The dense grid speed-up, and the hop clusters with the arc reader: no findings. Blocks guard, labels and contraction: three findings, fixed in 2c8a347f3, fa2b25e0d, 9146019c1 and 796aa4691. Contraction missed the join where two branches turn onto their shared last stretch at one point from opposite sides, and it kept only the first card where one run carries joins toward two cards. Both now keep the junction room, and unit tests in `compact/tests.rs` cover them. `route_labels/mod.rs` had grown to 606 lines, over the 600-line limit of the Rust source policy test. Reusing the route path brings it to 592.
After the review, one more picture changes against #66: vKEsyHFk#cPOdAA3f (Archboard server) 1889x1115 -> 1815x1046, with the same placement. So 17 of 110 pictures change and 93 are byte-identical.
Checks after the review: benchmark 220/220, root 1.96 s; renderer package tests 829/829; archboard-layout tests pass; repository lane 170/170; clippy for wasm32, rustdoc and cargo fmt clean.

Owner review on 2026-11-08: the owner looked at the 17 changed pictures, before and after, and accepted them: none is significantly worse. The owner then pointed at the blank space and long lines on the right side of 0T9enjhi#Zeo3aQWz, which the picture on #66 has too. That dead space belongs to TASK-559.09.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Blocks routes never cross, touch or run along their own ink, and a label never lies over another stretch of its own route. The corpus arc reader reads two flat-topped arcs on one line as two arcs. Contraction keeps the room a join needs before its card and stands a crossing at exactly its least room, and crossings that a crest would crowd form one cluster. The dense grid search weighs its pairs once and settles each grid once, so the root's first layout fell from 2.9 s to about 1.9 s. The benchmark passes 220 of 220. Against #66, 17 of 110 pictures change and cover 8.5% less area, and the owner accepted them by eye. ADR 0063 records the loop rule, the label rule and the join room. The dead space that is left in pictures such as 0T9enjhi#Zeo3aQWz is TASK-559.09.
<!-- SECTION:FINAL_SUMMARY:END -->
