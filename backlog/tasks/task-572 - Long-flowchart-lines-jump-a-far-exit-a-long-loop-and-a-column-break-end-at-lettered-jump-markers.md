---
id: TASK-572
title: >-
  Long flowchart lines jump: a far exit, a long loop and a column break end at
  lettered jump markers
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-03T23:38:00Z'
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
- [ ] #1 Steps that follow each other in a run stack close with no line between them, as wide as the widest of them
- [ ] #2 Of a decision of two answers, the taller answer runs straight on down out of the diamond foot
- [ ] #3 A decision whose one answer holds at least four more blocks than the other carries the long answer on in the run; the short answer stands beside the run, clear of the blocks beside it, and ends at a jump out to a jump in where the long answer ends, and guards whose long answers end together share one jump in
- [ ] #4 A loop that repeats four or more blocks jumps from the end of its body back to a jump in beside its hexagon, and its done line ends at a jump out beside the hexagon, from which the run goes on below the loop
- [ ] #5 A column ends at a jump out and the next column starts at its jump in, with no line between columns
- [ ] #6 Each jump has one letter and one ink for all its markers, counted in the order the picture holds them; an out marker is a tag that points the way its line went and an in marker is a disc; the letter is Onest Bold, bundled in the core
- [ ] #7 The answers of a decision join below the longest answer with room for each bend
- [ ] #8 ADR 0073 and the architecture proposal for the flowchart layout describe the jumps
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model guards, landings and long loops as blocks in graph.rs; the layout places every jump marker with ids taken from the blocks around it, and the picture letters and numbers them.
2. Add the Jump shape and JumpEnd to the paint request; the flowchart painter draws tags, discs, letters and inks; bundle Onest Bold as Face::SansBold.
3. Measure the clearance of a guard short answer from the blocks beside it instead of a fixed width.
4. Rust tests own stacking, guards, long loops, column jumps and jump pairing; rendered proof on the long dogfood flows in light and dark.
5. Update ADR 0073, the research note and proposal vdbwhuzZ; review with sol-loop; land on PR 34.
<!-- SECTION:PLAN:END -->
