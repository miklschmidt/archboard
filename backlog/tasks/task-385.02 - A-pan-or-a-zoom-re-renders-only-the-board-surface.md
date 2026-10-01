---
id: TASK-385.02
title: A pan or a zoom re-renders only the board surface
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-01 03:24'
labels:
  - frontend
  - performance
dependencies: []
parent_task_id: TASK-385
priority: medium
type: bug
ordinal: 666000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
useBoardCamera holds the camera in React state inside SemanticBoardStage, through useAutoFit. The stage passes one new view object to the whole sidebar on every render. Measured on 2026-10-01: a drag pan committed 38 times per second and re-rendered about 150 components per commit (SidebarLabel, SidebarRow, TypeSample, ViewChoice and the rest of the sidebar), 5858 component renders per second, with one DOM change per commit. The wheel zoom showed the same fan-out at 20 commits per second.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pan or a zoom frame re-renders no sidebar, inspector, legend or view-bar component
- [ ] #2 Pan, zoom, keyboard camera moves, fit, glide and walkthrough framing behave as before
- [ ] #3 A test fails when a camera move re-renders the stage sidebar
<!-- AC:END -->
