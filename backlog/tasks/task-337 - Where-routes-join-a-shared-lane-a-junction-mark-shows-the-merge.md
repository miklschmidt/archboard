---
id: TASK-337
title: 'Where routes join a shared lane, a junction mark shows the merge'
status: To Do
assignee: []
created_date: '2026-09-24 13:59'
labels:
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 578000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Relationships of one kind share a lane on purpose, so two relationships can finish on one line with one arrowhead (Archboard: 'register a checkout' and 'resolve code targets' into Repository checkout), and the picture reads as one relationship. User decision 2026-09-24: draw a small junction mark where routes join, as a circuit diagram does. It changes only the painting, never placement or routing. It must not be mistaken for the traffic marks already drawn on lines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Wherever two or more routes join into one drawn line, the join carries a junction mark, in the browser and headlessly
- [ ] #2 A junction mark cannot be mistaken for a traffic mark
- [ ] #3 Placement and routing are unchanged: only the painted marks differ between before and after
- [ ] #4 One test owner proves marks at joins and none elsewhere
- [ ] #5 Before and after pictures of every view of every dogfood board are shown to the user
<!-- AC:END -->
