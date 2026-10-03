---
id: TASK-386.01
title: >-
  The camera zooms by how far the wheel or pinch moved, and a drag carries on
  after release
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 15:13'
updated_date: '2026-10-03 15:44'
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
- [x] #1 A wheel or pinch event zooms about the pointer by an amount proportional to how far it moved, and one notch of a mouse wheel still zooms by about 10 percent
- [x] #2 A zoom, a key pan and a key zoom ease to where they were asked to go, and a new input during the ease continues from what is on screen
- [x] #3 A drag released while moving carries on and slows to rest, and a press, a wheel event or a key stops it at once
- [x] #4 The fit key glides to the whole board and does not cut
- [x] #5 With reduced motion the camera lands at once, with no ease and no carry-on
- [x] #6 A camera move re-renders only the board surface, and no frame loop runs once the camera is at rest
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure first. Wheel zoom reads only the sign of an event (ZOOM_STEP, 10 percent) and sets the camera at once; a drag ends dead; the fit key cuts. A search of the module found no inertia.
2. Pure arithmetic in lib/camera-motion.ts: a wheel turn becomes a zoom factor in proportion to how far it turned (a notch is ZOOM_STEP, a pinch turns far less to do as much); a Motion holds the zoom target with the point of the viewport and the diagram point that stay together, the distance an ease still has to cover, and the speed of a thrown drag; stepMotion runs one frame. Durations in shared/timing (CAMERA_EASE_MS, CAMERA_FLING_MS, CAMERA_FIT_MS).
3. use-camera-motion.ts runs the frame loop on the frame clock and draws each frame through the camera store, so the far view and the tip hear the camera as it is drawn. No frame loop runs at rest. Reduced motion lands at once.
4. use-board-camera.ts: the wheel handler and the key zoom call the motion; add ease (keys, clear of the panel), fling and stop; fit, glide, drag and follow-the-picture halt it.
5. Move the pointer gestures out of SemanticDiagram into use-diagram-gestures.ts (the file has no room for a velocity trail), add the trail and the throw on release, and stop a thrown drag on a press.
6. Key 0 glides to the whole board.
7. Tests: camera-motion.test.ts for the arithmetic; the stage tests drive the frame clock by hand (takeFrames, pressKey) and own the wheel, key, fit, throw, press, reduced motion and rest behavior; camera-renders still owns the surface-only render contract.
8. Board proposals: Board viewer@TASK-386.01 (Camera motion, Diagram gestures).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured in headless Chromium at 1920x1080 on Archboard server (dev page, Vite on 5192, real server on 3000): a wheel notch eases from 1.0 to 1.1 in about 460 ms (87 percent by 165 ms), the held point drifts at most 0.004 diagram units; a 30-event pinch burst (Control held, deltaY -3) zooms by 2.358 as computed, never by more than 2.9 percent in a frame (the old code zoomed 1.1 per event, 17 times in all); three ArrowLeft presses move the diagram 192 px; two + presses zoom 1.21; key 0 glides back to the exact fit; a drag of 220 px let go at 2.5 px/ms is thrown a further 798 px, about speed times CAMERA fling time; a press stops it where it is; an idle page asked for 0 animation frames in 700 ms.
Decisions. The durations live in one frozen object, EXPLORING_MS (src/shared/timing/lib/exploring.ts), because timing.ts is at its 600 line limit and a catch-all export is refused by lint. The pointer gestures moved out of SemanticDiagram into use-diagram-gestures.ts: the file had no room for a velocity trail, and the next tasks add hover to the same handlers. A press calls camera.stop(), which halts a zoom, an ease or a throw but not a walkthrough glide, so a click in the middle of a step does not cancel it.
Validation: bun test over src/ui/semantic-board-canvas, src/ui/frame-clock and src/shared/timing passes except the 10 drill-down tests that already failed before this change on the branch (semantic-board-inspection and sidebar drill-down). Type-check and lint are clean for the touched files; the repository-wide lint fails before this change on frontend/prototype-shell-worlds files that are not declared in the tsconfig. Browser lane: semantic-board-viewer, semantic-traffic and semantic-walkthrough-presentation pass; semantic-board-inspection fails on the drill-down target variant, as it does without this change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The camera now moves like a hand. A wheel or pinch zooms in proportion to how far it turned (a mouse notch is still 10 percent) about the pointer, every zoom and key move eases toward its target on the frame clock, a drag let go while moving is thrown and slows to rest, a press stops it, and the fit key glides. Reduced motion lands at once and a camera at rest asks for no frames. Verified with 16 arithmetic tests (lib/camera-motion), the stage tests driven by a hand-stepped frame clock (wheel, keys, fit glide, throw, press, rest, reduced motion), the camera-renders contract, headless Chromium probes on the densest board, and the viewer, traffic and walkthrough browser owners. Board proposal Board viewer@TASK-386.01 adopted: Camera motion and Diagram gestures.
<!-- SECTION:FINAL_SUMMARY:END -->
