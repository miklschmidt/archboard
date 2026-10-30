---
id: TASK-559.03
title: Keep one surface and one accepted scene, and bring the transitions back
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
labels:
  - frontend
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 975000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #19 killed all transitions: the reader calls stagePicture directly, keys remount the diagram and the camera on each scope, and a pane reports a reading as drawn before the picture exists. A person cannot judge navigation on a canvas that destroys itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Changing a reading, scope, grammar or comparison keeps the header, the sidebar, the camera owner and any open control mounted
- [ ] #2 Inspection, Ask, export and agent context read the accepted scene, and a late result never replaces a newer destination
- [ ] #3 A pane reports a reading as drawn only after the picture exists
- [ ] #4 Each transition that origin/main shows for an action exists for the same action, and reduced motion is honored
- [ ] #5 Back returns the camera of that reading, and moving to another module clears stale subject and flow intent
<!-- AC:END -->
