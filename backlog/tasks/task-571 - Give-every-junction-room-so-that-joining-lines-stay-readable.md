---
id: TASK-571
title: Give every junction room, so that joining lines stay readable
status: To Do
assignee: []
created_date: '2026-11-03T18:46:00Z'
labels:
  - renderer
  - layout
dependencies: []
ordinal: 1017000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Where several lines join, the renderer draws them into a knot that a reader cannot follow. In a flowchart, nested decisions that end at the same place stack their joins a few pixels apart, so the lines of six answers meet in one tangle (the flow 'A context change reaches a workhorse' shows it below its last decision). The owner reports the same knot at junctions in architecture readings, where lines meet on a shared trunk. The bends are as tight as the line style allows and nothing reserves room between one junction and the next, or between a junction and the box the joined line enters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Where two or more lines join, each line's bend into the junction is visible on its own at the reference pane's scale, in flowcharts and in architecture readings
- [ ] #2 Two junctions on one line stand far enough apart that a reader can tell them apart, and a joined line runs straight for a visible length before the box it enters
- [ ] #3 Nested flowchart decisions that end at the same place join at junctions a reader can follow, not a stack of joins in one spot
- [ ] #4 A rendered owner covers a flowchart with nested decisions that end together and an architecture reading with a shared-trunk junction
<!-- AC:END -->
