---
id: TASK-385.02
title: A pan or a zoom re-renders only the board surface
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 03:24'
updated_date: '2026-10-01 04:18'
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
- [x] #1 A pan or a zoom frame re-renders no sidebar, inspector, legend or view-bar component
- [x] #2 Pan, zoom, keyboard camera moves, fit, glide and walkthrough framing behave as before
- [x] #3 A test fails when a camera move re-renders the stage sidebar
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep where the camera is in a small store that useBoardCamera makes once (read, write, subscribe), in place of React state. Every move writes it: pan, zoom, wheel, fit, glide, and following the picture.
2. BoardCamera exposes view() and subscribe() and no longer carries the camera value, so its identity changes only with the room and the movers. The stage stops rendering again on a move.
3. Readers subscribe at the leaves. A CameraSurface part of SemanticDiagram renders the surface element from useCameraView. The far mark reads a yes or no through useCameraWith. The tip closes on any move through subscribe. useAutoFit reads view() when a presentation takes the camera.
4. Own it with a module test that watches which components render, through the React developer tools hook, during a key pan and a wheel zoom.
5. Board proposals: none. Board viewer draws Control camera and Keep fitted at a level this does not change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured with the probe in headed Chromium (GPU compositing), drag pan: before, 38 commits/s and 5858 component renders/s (the stage, trail, standing and the whole sidebar per frame), script 70 ms/s. After, 31 commits/s and 35 renders/s (CameraSurface once per commit), script 22 ms/s. Wheel zoom: 3057 renders/s before, 17/s after.

src/ui/semantic-board-canvas/tests/camera-renders.test.tsx failed before the change and listed the fan-out. It loads React through a dynamic import, because Bun links the CommonJS react-dom before any module body runs, and the developer tools hook must exist first.

Validation: canvas module tests (176), the full serial browser lane (19 owners), tests/system/server-state/walkthrough-replay.test.ts, and type-check all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The camera now lives in a store that useBoardCamera makes once. The stage holds a stable handle, the surface element subscribes to the position, the far mark subscribes to a yes or no, and the tip closes on any move through a subscription. A drag pan now renders one component per frame instead of about 150: 35 renders/s instead of 5858, script 22 instead of 70 ms/s. Verified with a new render-watch module test that was red before, the canvas tests, the full browser lane and the walkthrough replay test.
<!-- SECTION:FINAL_SUMMARY:END -->
