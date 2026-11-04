---
id: TASK-576
title: >-
  Most flowcharts draw NaN points in a round marker at their top, so their SVG
  breaks and no painter reads them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T19:29:00Z'
updated_date: '2026-11-04T21:24:00Z'
labels:
  - bug
  - renderer
dependencies: []
references:
  - crates/archboard-scene/src/paint/flowchart_shapes.rs
  - crates/archboard-scene/src/paint/polygon.rs
priority: high
ordinal: 1020000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
140 of the 148 flowchart drawings of this repository's own model draw broken geometry, in both themes, with the blocks engine, at commit ac0d90bfe. No architecture or sequence drawing is affected. Two examples are "The coordinator stops its workhorses" (`vKEsyHFk/SJ2JMVyz#MedLccOG`) and "Draw a sequence" (`vKEsyHFk/gbyqW4H3#APiBh4ih`).

Their SVG holds `NaN` in path data, 960 and 1,600 times in those two examples, in one round marker about 38 by 38 units at the top of the flowchart and in its shadow bands. A path that starts `M NaN NaN` draws nothing, so an export, a PNG and the SVG ink of the page lose that marker. The painting serializes the same coordinates as `null`, so `Painter.show` refuses it with "invalid type: null, expected f64" on every painter. The canvas then falls back to that broken ink, so a reader of a flowchart gets no painter and no motion.

The spike for docs/design/painter-webgl-fallback.md found this with `bun scripts/render-corpus.ts render <out> --engines blocks --variants current --comparison off --themes light,dark --svg`. The parity run of TASK-562 read every painting of the corpus, so the fault is newer. Commit 110c0bd11 (PR #34, lettered jumps) is the last change to crates/archboard-scene/src/paint/flowchart_shapes.rs, which makes it the likely origin, but nobody confirmed that. A likely cause, also not confirmed: `terminal_outline` draws the start marker on a box whose width equals its height, so its two half circles meet in repeated points, and a later step divides by the length of a zero-length side.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No drawing of the corpus holds NaN or Infinity in its SVG path data, in either theme
- [ ] #2 Every painting of the corpus reads in `Painter.show` with no error
- [ ] #3 A jump-in disc on its square box draws itself and its shadow in points that a painter reads back, and a focused test owns that case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find the path that writes NaN, starting from the reproducer and the corpus.
2. Fix the outline that breaks the polygon contract, keeping the marker's shape.
3. Add a focused Rust test that fails before the fix, on the shape that triggers the bug.
4. Rebuild the core, render the small corpus with --svg, and count NaN in each SVG and null coordinates in each painting, before and after.
5. Draw again every tracked drawing that the fix changes.
6. Run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: PR #34 (110c0bd11) added the jump-in disc, a JUMP_IN by JUMP_IN (30 by 30) box drawn through `terminal_outline`. On a square box the two half circles meet, so the outline repeats two points and holds two sides of zero length. `inset` divides each side by its length, 0/0 gives a NaN direction, and `meeting` returns NaN corners. Only the eight shadow bands of each disc (`polygon_shadow`, which grows the outline with `inset`) hold NaN. The disc itself draws, because `intersection` drops tiny sides. Start and End terminals are 96 by 34 and never square, so the start marker was never affected. Before the fix, every NaN path in the corpus was a disc shadow band: 306 discs in 140 drawings.

Fix: `terminal_outline` stops each half one step short on a square box, so the disc is 32 distinct points of the same circle. A pill keeps its 34 points.

Revised AC #3: start and end terminals have a fixed 96 by 34 box, so only the jump-in disc reaches a square box. The criterion now names that case.
<!-- SECTION:NOTES:END -->
