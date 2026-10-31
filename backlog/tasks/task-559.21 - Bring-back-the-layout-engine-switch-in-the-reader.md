---
id: TASK-559.21
title: Bring back the layout engine switch in the reader
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T03:12:00Z'
updated_date: '2026-10-31T04:42:00Z'
labels:
  - frontend
dependencies: []
documentation:
  - docs/adr/0064-blocks-is-the-default-layout-engine.md
parent_task_id: TASK-559
priority: medium
ordinal: 993000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On main the right sidebar held a control that switched between Blocks and Tracks, and the browser remembered the choice. Pull request 19 lost it for the model reader: SemanticEngineBar lives only in the retained board stage, and the reader's pictures take no layout from it, so a reader always draws Blocks. The owner asked how to switch and could not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reader can switch a Diagram reading between Blocks and Tracks from the right column, and the picture redraws with that engine
- [x] #2 The browser remembers the choice, and the stored drawings of one engine never answer for the other
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Plumb the engine into the drawing request and its key, for structural readings only, because the core lays out nothing else.
2. The scene key and the fit name the engine, so a switch is pending until its picture exists and then fits afresh.
3. ModelEngine under the legend, on structural readings, with the existing switch.
4. Measure Tracks on the root and Commands after the door work.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner reviewed what moved out of the old right sidebar and accepted it: the comparison summary as the Changes tab, walkthroughs in the left column, no named views, and groups through the tag click. Only the engine switch comes back, under the legend.

Verification: check:all exit 0, 21 of 21 tasks. reader-context.test.ts owns the switch, the kept selection and the choice across a reload. use-accepted-scene.test.tsx owns that one engine's drawing never answers for the other. Measured on this repository after the door work: Tracks draws the root (2225 by 1589) and Commands (5907 by 1435) with no notice. Commands is very wide on Tracks, so a reader must pan or press 0.

Merged to integrate/pr19 with TASK-559.22. Open: owner review.
<!-- SECTION:NOTES:END -->
