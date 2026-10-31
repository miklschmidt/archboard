---
id: TASK-559.21
title: Bring back the layout engine switch in the reader
status: To Do
assignee: []
created_date: '2026-10-31T03:12:00Z'
updated_date: '2026-10-31T03:15:00Z'
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
- [ ] #1 A reader can switch a Diagram reading between Blocks and Tracks from the right column, and the picture redraws with that engine
- [ ] #2 The browser remembers the choice, and the stored drawings of one engine never answer for the other
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner reviewed what moved out of the old right sidebar and accepted it: the comparison summary as the Changes tab, walkthroughs in the left column, no named views, and groups through the tag click. Only the engine switch comes back, under the legend.
<!-- SECTION:NOTES:END -->
