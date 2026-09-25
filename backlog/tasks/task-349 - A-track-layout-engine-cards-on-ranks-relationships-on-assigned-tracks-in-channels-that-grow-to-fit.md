---
id: TASK-349
title: >-
  A track layout engine: cards on ranks, relationships on assigned tracks in
  channels that grow to fit
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-25 00:15'
updated_date: '2026-09-25 06:14'
labels:
  - renderer
dependencies: []
priority: high
type: feature
ordinal: 590000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ground-up rethink, user direction 2026-09-25: fast, beautiful, easy to understand at 1080p to 2160p; discard what does not clearly improve on the current engine. Design: Graphviz ranks and orders cards across containers (keeping ADR 0033's gain over ELK) but its coordinates are only a start; every relationship runs down from its source, along a track in the channel between ranks, and down into its target, passing intermediate ranks in the gutter Graphviz reserved for it; tracks and label rows in each channel are assigned by interval packing (left-edge channel routing), and channels grow to hold them instead of squeezing lanes; labels sit on their own line by construction; one deterministic pass, no settlement loops. Groups are regions (blocks) like containers (TASK-347 decisions apply). Built iteratively on the real dogfood boards behind the engine seam (TASK-348).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The track engine lays out every dogfood board and view without error, each in well under 1 s
- [ ] #2 Parallel lanes keep a fixed spacing, no route loops back on itself, and every label sits on its own line, on every dogfood drawing
- [ ] #3 Containers, group regions and column folds are supported
- [ ] #4 The user compares both engines in the gallery and judges the track engine's pictures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep Track's global Graphviz ranking with clusters; route every line on tracks (done before today).
2. Wrap a rank wider than the pane into rows, choosing among cut and dealt wraps on one score: fit to the reference pane less 3% per crossing (track/wrap.ts, track/score.ts).
3. Remove hooks: labels settle on the lane or card face their line meets, a shared port stands over its middle-most far end, turns fit short runs.
4. Fix contracts Track broke: arrows into a container end on its edge, twin relationships share both ports, badges keep the shared clearance, ties fall to the board's order; run those contract tests under every engine.
5. Fold: a board with no container or region is one block of cards, handed to the block layout, which folds on the same score, a line between columns costing eight crossings.
6. Grid cards no relationship touches, as a scored candidate.
7. Next: container boards fold too, by laying containers out inline as clusters inside the block layout (Track = Blocks with inline containers), then choosing inline or packed per container by score.

8. Inline clusters (in progress 2026-09-25): BlockTree inline mode records containers and group regions as clusters on the block that lays them out; CardLayout builds them as Graphviz subgraphs with title and caption nodes and reads their boxes back for the Scene and the Assembly; the fold cuts only between ranks no top-level cluster spans and moves whole clusters into columns. Track becomes the block engine in inline mode; the old Track pipeline is deleted once the new one matches it on crossings, line length, bends and fit over both vaults.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-25, measured over the dogfood gallery (49 drawings) with crossings counted from the painter's bridge masks: Track at the start of the day drew 285 crossings, 624k units of line, 5308 bend points, 273 jogs shorter than two corner radii, mean fit 0.642; now 244 crossings, 589k, 4614 bends, 229 jogs, mean fit 0.673, slowest drawing 213 ms. Blocks draws about 649 crossings and 700k of line on the same boards; Graphviz 252 crossings and up to 7.6 s. Work vault (a copy, two groups given colours in the copy only): Track mean fit 0.859 -> 0.879, the IIS application portfolio from one 3856-wide row (0.33) to a grid that fits whole. User feedback 2026-09-25: 'Track engine is showing a lot of promise'.

2026-09-25, later: Track moved onto the block engine. The block tree has an inline mode (blocks/inline.ts) in which every container and group region is a Graphviz cluster of the board's one layout (blocks/clusters.ts), ranked across with newrank; the old track placement, wrap step and main-thread routing are deleted. Folds now cut only between ranks no container spans and carry containers whole; a line ending on a container counts as a bus line. A block whose lines run between containers is also tried stacked (containers held below the line's source, title edges only where nothing inside holds a member), weighed at its best fold; the stacked layout wins for chains of containers and loses on most real boards. Old track -> new track over the dogfood gallery: crossings 224 -> 200, line length 598k -> 580k, short jogs 224 -> 209, mean fit 0.682 -> 0.687, slowest drawing 196 ms; the work vault is level or better. Crossings are now counted from the painter's bridge masks; earlier numbers in these notes that came from segment intersections undercounted bridged crossings.

2026-09-25, polish on the block engine: Graphviz now meets a block's lines in the board's order (tail card, then head card), so interchangeable cards stand as the board lists them without moving anything after placement; a wrap keeps neighbouring peers on one row. A line from a part into its own container drawn inline runs upward (the part had been lifted out of its frame). A channel no line crosses under a band of titles alone is 20 px, the container inset. Every wrap is also laid with its lowered cards chained into columns, and the score picks. Dogfood Track: crossings 200 -> 182, bends 4564 -> 4517, short jogs 209 -> 189, mean fit 0.687 -> 0.695, slowest drawing 393 ms (Archboard server whole). Work vault: 30 crossings, fit 0.886. Tried and discarded: reordering peers after placement (labels stay behind, crossings rise), flat order edges inside clusters (Graphviz ignores them under newrank), lanes preferring the upper station's column (191 crossings), pairwise lane untangling (flips whole-layout choices, 193 crossings). Under Track as the default, 9 renderer tests still fail, each checked: two folds that lose to the bus cost by design; a container's external dependency drawn beside it rather than ahead; a branching reading's wrap; three bends per route on the flank fixture (3.2); the title air in the 10-card pool with 14 fans (the lines leave from the title, so the channel under it holds tracks); parallel database badges; the spread of unowned nodes; and on Public API a line entering a container through its title band, which is how Track enters containers. Also fixed since: a container reaches one inset below the containers inside it, and a channel's tracks start below the containers that end above it (the Public API line that ran inside an unrelated container).
<!-- SECTION:NOTES:END -->
