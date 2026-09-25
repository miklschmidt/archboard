---
id: TASK-349
title: >-
  A track layout engine: cards on ranks, relationships on assigned tracks in
  channels that grow to fit
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-25 00:15'
updated_date: '2026-09-25 19:18'
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

2026-09-25, later still, all gated and on main: a container reaches one inset below the containers inside it and a channel's tracks start below the containers that end above it; a title or caption sits at the foot of its band; a line that can run straight between its card and its other end keeps its own port instead of joining a trunk (in and out); a line's label stands inside the container the line enters, over its card (containers only, never regions). Track since the start of the day's polish (dogfood / work vault): crossings 200 -> 155 / 30 -> 29, line length 580.2k -> 559.9k / 97.6k -> 73.7k, bends 4564 -> 4108 / 888 -> 672, mean fit 0.687 -> 0.692 / 0.884 -> 0.895; the work vault's share of line length beyond the shortest path fell from 10.1% to 3.3%. Tried and discarded: keeping Graphviz's lane order while straightening (167 crossings), aligning the lane runs either side of a label (162), and labels inside group regions (256). Remaining crossings sit mostly on the three largest whole boards (Archboard server, Browser application, Agent workbench).

2026-09-25, packed groups (5cf65e84, gated): the block tree's nesting is blocks, inline or groups. Track lays a board that has groups both inline and with each (container, group) region packed as a block of its own inside the board's own layout, and keeps the packed drawing only when it scores better on the assembled drawing and draws no more line (side by side, packed blocks can loop a line round both). This answers TASK-347's open region-shape problem where it pays: Agent workbench 24 -> 12 crossings, Command interface 3 -> 0, both compact; Browser application and Archboard server stay inline (packing them scored worse). Empty channels are 24 px. Dogfood Track now 140 crossings, 542k line, fit 0.700; work vault 28 crossings, 70k line, fit 0.910 (the Graphviz engine: 252 / 30 crossings, fit 0.691 / 0.907, slowest drawing 8 s against Track's 452 ms).

Visual polish round (2026-09-25), from three adversarially verified visual bug hunts (Track 29 classes, Graphviz 28, Blocks 29 confirmed). On branch visual-polish, measured on both vaults (crossings / bends / jogs, dogfood Track 140/4060/175 before):
- Track routing: notches closed by a guarded stretch move (jogs.ts), rising lines keep an arrowhead's approach, crowded bands place labels exactly (fewest jogs, then short jogs, then displacement), labels ignore trunk-shared ends, straight labels centre on their shared face, lines keep clear of heading words, lane columns and trunks chosen for fewest crossings, lines that read as one parted, the score counts crossing places as drawn, facing containers keep an inset, stranded lanes follow slid labels, card in/out steps closed, lanes keep half a lane off walls, labels stay within the scene's extent, twin lines keep their own card ends. Track dogfood now 124/3435/107, work 20/526/18.
- Shared: label plates fitted to balanced text (measurement.ts); sequence lifelines, divider, arrowhead reach and removed-step plates; placement: chains in one column, sunk wraps dropped, sibling frames 20 px apart, near-miss columns aligned (Graphviz dogfood 252 to 225 crossings).
- Still running: painter (hops, junction dots, pulses), Graphviz engine, Blocks engine, Track margin-lap relay. Card line trim waits on branch measure-trim for a Graphviz alignment fix.
<!-- SECTION:NOTES:END -->
