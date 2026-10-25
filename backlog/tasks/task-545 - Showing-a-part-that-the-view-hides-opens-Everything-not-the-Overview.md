---
id: TASK-545
title: Showing a part that the view hides opens Everything, not the Overview
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T21:57:00Z'
updated_date: '2026-10-25T21:57:00Z'
labels:
  - frontend
  - bug
dependencies: []
type: bug
ordinal: 951000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The About page's show control and the header's code warnings bring a part into view. When the view on screen does not draw the part, the pane is meant to open the whole board first (useSubjectFocus). It asks for view null, which since ADR 0052 is the Overview, and the Overview draws every container closed. So on a board read through its Overview, showing a part inside a container does nothing: the view stays, and the camera does not move. Found while QA-ing TASK-537.03 on the Board viewer board, whose step through a design question uses the same path. The unit tests did not see it, because their fixture draws the whole board for view null.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Showing a part that the view on screen does not draw opens the view named Everything, and the camera then fits the part
- [ ] #2 This holds from the Overview and from an authored view
- [ ] #3 The About and code-warning tests assert the request for Everything
<!-- AC:END -->
