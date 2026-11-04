---
id: TASK-572
title: >-
  Long flowchart lines jump: a far exit, a long loop and a column break end at
  lettered jump markers
status: Done
assignee:
  - '@claude'
created_date: '2026-11-03T23:38:00Z'
updated_date: '2026-11-04T00:04:00Z'
labels:
  - renderer
  - flows
  - layout
dependencies: []
documentation:
  - >-
    docs/adr/0073-a-flowchart-lays-out-from-its-flow-and-a-flow-opens-in-the-reading-that-fits.md
  - docs/design/flowchart-layout-research.md
ordinal: 1018000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 34 broke a long flowchart into columns, but the owner found the result hard to read: the line between two columns rose through the gap and could pass for a loop, the short answer of a lopsided decision ran a long empty line down to its join, a long loop ran its back line and its done line round the whole body, and the joins of nested decisions stacked into one knot. Research (docs/design/flowchart-layout-research.md) and a prototype on the dogfood flows "Grading a batch" and "A context change reaches a workhorse" showed that off-page style jump markers, as ISO 5807 connectors and DRAKON use them, remove those lines. The owner approved the prototype look: an out marker is a tag that points the way its line went, an in marker is a disc, each jump has its own letter in Onest Bold and its own ink (black on light and white on dark, then rose, lime, orange and indigo, lime and orange bright on the light theme). The owner asked for a proper implementation of the prototype before merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Steps that follow each other in a run stack close with no line between them, as wide as the widest of them
- [x] #2 Of a decision of two answers, the taller answer runs straight on down out of the diamond foot
- [x] #3 A decision whose one answer holds at least four more blocks than the other carries the long answer on in the run; the short answer stands beside the run, clear of the blocks beside it, and ends at a jump out to a jump in where the long answer ends, and guards whose long answers end together share one jump in
- [x] #4 A loop that repeats four or more blocks jumps from the end of its body back to a jump in beside its hexagon, and its done line ends at a jump out beside the hexagon, from which the run goes on below the loop
- [x] #5 A column ends at a jump out and the next column starts at its jump in, with no line between columns
- [x] #6 Each jump has one letter and one ink for all its markers, counted in the order the picture holds them; an out marker is a tag that points the way its line went and an in marker is a disc; the letter is Onest Bold, bundled in the core
- [x] #7 The answers of a decision join below the longest answer with room for each bend
- [x] #8 ADR 0073 and the architecture proposal for the flowchart layout describe the jumps
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model guards, landings and long loops as blocks in graph.rs; the layout places every jump marker with ids taken from the blocks around it, and the picture letters and numbers them.
2. Add the Jump shape and JumpEnd to the paint request; the flowchart painter draws tags, discs, letters and inks; bundle Onest Bold as Face::SansBold.
3. Measure the clearance of a guard short answer from the blocks beside it instead of a fixed width.
4. Rust tests own stacking, guards, long loops, column jumps and jump pairing; rendered proof on the long dogfood flows in light and dark.
5. Update ADR 0073, the research note and proposal vdbwhuzZ; review with sol-loop; land on PR 34.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: graph.rs builds Guard, Land and Loop{back} blocks; layout/stack.rs fills columns and jumps between them; layout/branches.rs lays out guards, landings and long loops; every marker id derives from block ids ({guard}~jump, {guard}~land, {loop}~back, {loop}~again, {block}~out and {block}~in), and picture() numbers and letters the jumps in page order. The paint request carries FlowchartShape::Jump{end, number}; flowchart_shapes.rs draws tags, discs, letters and inks. Onest Bold 1.000 is Face::SansBold.
Fixes found while proving: a long loop or guard whose body broke into columns placed its jump out under the loop axis (slanted line), and a body end ran down to its tallest column before jumping; the jump out now stands right below the end, and chain ends are no longer carried to the run foot.
Review: sol-loop, 2 rounds with gpt-6.1-sol on xhigh. S1 [blocker] count() counted generated landings as blocks; fixed in b3b19f13a. Round 2 approved.
Verification: archboard-flows tests (13 flowchart tests); renderer tests flow-logic and flowchart-answers updated to the straight answer and to columns; bun run check 21 of 21 lanes; rasters of "Grading a batch" (0.53 of full size in the reference pane), "A context change reaches a workhorse" (0.45, from 0.26 on main) and "A canonical edit becomes durable" (whole at full size) on both themes; headless browser session of the reader on both themes; proposal vdbwhuzZ edited, checkpoint e1a5e44b967cb9e436f0706e2c1d60d590b5935e.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A long flowchart line that would run far round other blocks now jumps: it stops at a jump out, a tag that points the way it went, and goes on at the jump in with the same letter, a disc. Each jump has one letter in Onest Bold and one ink (black or white, rose, lime, orange, indigo; lime and orange bright on the light theme). Guards jump their short answers to a landing where the long answer ends, long loops jump back to their hexagon and on from beside it, and columns jump from foot to top. Steps that follow each other stack with no line between them, the taller of two answers runs straight down, and joins get room. ADR 0073, the research note and proposal vdbwhuzZ describe it. Verified by Rust and renderer tests, bun run check, rasters and a browser session on both themes, and two Sol review rounds. Follow-up outside this task: TASK-571 for junctions in architecture readings; guards are still chosen by block count, not line length.
<!-- SECTION:FINAL_SUMMARY:END -->
