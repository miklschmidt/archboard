---
id: TASK-330
title: A flow's frame widens for a self-step label on its last column
status: To Do
assignee: []
created_date: '2026-09-24 13:37'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 571000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by TASK-327 and confirmed by TASK-328.03: in the Renderer layout board's 'Layout sequence' view, the self-step 'Place with Graphviz, route around cards with libavoid' on the rightmost column (Layout engine) runs past the flow frame's right edge: the frame ends near x=672 and the label near x=818, although the page is wide enough. The frame width does not count a self-step label on the last column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A self-step label on a flow's last column lies inside the flow frame
- [ ] #2 One test owner fails without the fix
- [ ] #3 Every view of every dogfood board still draws, and the renderer's recorded scorecards are unchanged or better
<!-- AC:END -->
