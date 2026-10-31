---
id: TASK-559.28
title: End each relationship on the part that makes or answers it
status: To Do
assignee: []
created_date: '2026-10-31T04:16:00Z'
updated_date: '2026-10-31T05:29:00Z'
labels:
  - model
dependencies: []
parent_task_id: TASK-559
priority: high
ordinal: 1000000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A relationship that ends on a module with parts makes a caller and no entry point, so the interface measures read wrong. On this repository 70 of 114 modules with parts hold such an end, and 9 read as no entry points with all parts hidden although callers reach them (for example Pane session and Browser gateway, 6 each). The owner decided that a module cannot point at anything when the view is only that module: its entry points can, and those need a card. Moving each relationship to the part that makes the call: owner comment excellent. Delegated decision: do the full repair. It includes the 26 own-part relationships of TASK-559.24 and the 12 parts they need.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every relationship with an end on a module with parts moves to the part that makes or answers the call, read from source, or stands in a report with its reason
- [ ] #2 The 26 own-part relationships of TASK-559.24 are repaired, with the parts they need
- [ ] #3 archboard check warns on a relationship that ends on a module with parts, and the frame line stays drawn until it is repaired
- [ ] #4 The consumer skill tells an author to end a relationship on the part that makes or answers it
- [ ] #5 No module with parts reads as no entry points when callers reach it, except where the report gives the reason
- [ ] #6 Flows and walkthroughs still resolve, and no proposal is adopted or lost
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full repair held back, not merged. Measured on every reading against the model at 6a910327b: drawn lines 1694 to 2605, area 148.5 M to 243.5 M, readings that pass the fit gate 107 to 94 of 115, readings below 0.4 from 1 to 7, slowest drawing 509 ms to 767 ms. Canonical checkpoint operations went from 3 parts and 23 lines to 13 parts and 90 lines, and most new lines are file imports named after symbols. That is an import map and not architecture, so it fails the purpose. feat/relationship-ends at b58c99db9 stays as an option. Next: a smaller repair that adds a part only where it must.
<!-- SECTION:NOTES:END -->
