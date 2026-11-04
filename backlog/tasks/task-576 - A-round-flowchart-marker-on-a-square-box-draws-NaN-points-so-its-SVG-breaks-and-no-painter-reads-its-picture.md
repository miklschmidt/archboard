---
id: TASK-576
title: >-
  Most flowcharts draw NaN points in a round marker at their top, so their SVG
  breaks and no painter reads them
status: To Do
assignee: []
created_date: '2026-11-04T19:29:00Z'
updated_date: '2026-11-04T19:31:00Z'
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
- [ ] #3 A start, an end and a jump-in marker on a box whose width equals its height draw a closed round outline with finite points, and a focused test owns that case
<!-- AC:END -->
