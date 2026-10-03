---
id: TASK-386.01
title: >-
  The camera zooms by how far the wheel or pinch moved, and a drag carries on
  after release
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-03 15:13'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: high
type: enhancement
ordinal: 671000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The wheel handler reads only the sign of an event and zooms by a fixed 10 percent. A trackpad pinch fires dozens of events a second, so one pinch can zoom by orders of magnitude, and a hard flick of a wheel cannot be told from a gentle one. A drag ends the instant the pointer lifts, and the fit key cuts to its camera. A search of the module on 2026-10-03 found no inertia anywhere in the camera. Maps and design tools feel like a hand because a zoom follows the gesture and a thrown drag keeps its speed. TASK-385.02 holds the contract that a camera move re-renders only the surface, and ADR 0041 holds the contract that everything which moves runs on the frame clock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A wheel or pinch event zooms about the pointer by an amount proportional to how far it moved, and one notch of a mouse wheel still zooms by about 10 percent
- [ ] #2 A zoom, a key pan and a key zoom ease to where they were asked to go, and a new input during the ease continues from what is on screen
- [ ] #3 A drag released while moving carries on and slows to rest, and a press, a wheel event or a key stops it at once
- [ ] #4 The fit key glides to the whole board and does not cut
- [ ] #5 With reduced motion the camera lands at once, with no ease and no carry-on
- [ ] #6 A camera move re-renders only the board surface, and no frame loop runs once the camera is at rest
<!-- AC:END -->
