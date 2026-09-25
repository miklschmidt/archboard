---
id: TASK-349
title: >-
  A track layout engine: cards on ranks, relationships on assigned tracks in
  channels that grow to fit
status: To Do
assignee: []
created_date: '2026-09-25 00:15'
updated_date: '2026-09-25 00:15'
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
