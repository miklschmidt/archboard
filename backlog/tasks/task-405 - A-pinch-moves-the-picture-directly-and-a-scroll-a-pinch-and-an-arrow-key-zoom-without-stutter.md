---
id: TASK-405
title: >-
  A pinch moves the picture directly, and a scroll, a pinch and an arrow key
  zoom without stutter
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-06 09:53'
updated_date: '2026-10-07 01:41'
labels:
  - frontend
dependencies: []
references:
  - docs/adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md
ordinal: 692000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner reports that zooming with the scroll wheel, the arrow keys and a pinch feels bad, while dragging is fine. The owner also does not want any easing on a pinch: the picture must follow the fingers at once, as the drag does since TASK-403. The slab look draws two to three times as many shapes as the flat look, so repainting the picture at every zoom step may be the cost. Nobody has measured it yet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pinch, from a touch screen and from a trackpad, applies each step to the camera at once with no easing, and a test holds it
- [ ] #2 The frame time during a scroll zoom, an arrow-key zoom and a pinch on a large board is measured before and after the change, with the numbers and the method in the task notes, and it is lower after the change
- [ ] #3 The scroll and arrow-key zoom keep their easing unless the measurement shows that the easing is the cost, and the notes say which it was
- [ ] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find how a pinch, a wheel and a key reach the camera (use-diagram-gestures, use-camera-motion, use-board-camera). A trackpad pinch arrives as a wheel event with the control key. 2. Measure the frame time and the paint cost of a zoom on a large board in a real Chromium, before any change. 3. Make a pinch apply at once with no easing. 4. Cut the cost that the measurement shows: for example keep the picture on its own layer at a fixed raster scale while a gesture runs, and draw it sharp when the gesture ends, and avoid layout and React work per step. 5. Measure again, record both sets of numbers, amend ADR 0042, and run bun run check.

Revised after measuring: 6. A pinch (ctrl-wheel from a trackpad, and two touch pointers, which need touch-action none on the viewport) moves the camera at once through pure arithmetic in lib/camera.ts; the wheel and the keys keep their ease. 7. The camera store says whether a hand is moving the camera and where it last came to rest; it counts as at rest once a hand has left it alone for one duration (EXPLORING_MS.cameraRest, the former trafficRest). 8. While a hand moves the camera the surface carries will-change transform, so a zoom step moves a layer instead of painting and rasterizing the picture again; at rest the class goes and the picture is drawn sharp once. 9. The far view follows the camera at rest, not every frame, so a zoom crosses the far line with one eased swap at the end instead of a cross-fade in the middle. 10. The traffic waits on the same rest instead of a timer of its own.

Completion evidence: update Board viewer@TASK-405 to the built immediate pinch, camera controller/store, motion layer and rest-held far view. Preserve existing subject ids and explain the TASK-406 flight hold and TASK-428 two-frame rest in that proposal. Compare, inspect against source, adopt, and run dogfood check. The material improvement is that the next agent can locate the actual owner of camera state and see when the picture changes its near/far content.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured before any change (2026-10-06). Method: a private Archboard server (port 3443) on a copy of the dogfood vault, board 'Archboard server' (about 4000 by 3000 units, fitted at scale 0.32), a 1920 by 1080 headless Chromium driven over CDP with real input events (Input.dispatchMouseEvent wheel, with modifiers=2 for a trackpad pinch, Input.dispatchKeyEvent for '=' and '-', Input.dispatchTouchEvent for a two-finger pinch). A small proxy serves a chosen frontend build in front of the same server, so before and after run against the same pictures. Each scenario is four legs (in, out, in, out), so the far line (0.75) is crossed: 60 wheel notches (deltaY 100, every 16 ms), 60 ctrl-wheel steps (deltaY 8, every 16 ms), 20 key presses (every 50 ms), 60 touch moves. In the page a requestAnimationFrame loop records frame intervals and a PerformanceObserver records long tasks. A Chrome trace counts paints and raster time. Medians of 3 runs. Two setups: the real GPU (RTX 4090 through ANGLE Vulkan, GPU raster and compositing) and software (no GPU). Software numbers are much worse in absolute terms, so compare before and after on one setup only.

BEFORE, GPU: wheel frame mean 17.5 ms, 13 of 361 frames over 25 ms, max 50 ms, raster 1071 ms, 154 paints, 4 far swaps (216 near/far fades). Pinch (ctrl-wheel): mean 17.4 ms, 13 of 331 over 25 ms, raster 1084 ms, 154 paints. Keys: mean 16.7 ms, 0 of 139 over 25 ms, raster 367 ms. Touch pinch: does nothing (no touch pinch is handled; the camera does not move).
BEFORE, software: wheel mean 22.0 ms, 139 of 482 over 25 ms, 13 long tasks (785 ms), raster 22085 ms, commit 2708 ms. Pinch: mean 21.6 ms, 130 of 502 over 25 ms, raster 21090 ms. Keys: mean 20.6 ms, 27 of 119 over 25 ms, raster 4601 ms.
Finding: a zoom step changes the scale of the surface, which is not a compositor layer, so every step repaints the picture and rasterizes every visible tile again (27000 raster tasks in one software wheel run). A drag only translates, and the surface is a layer of its own while it drags, which is why a drag is smooth. Putting will-change: transform on the surface for the same wheel run cut software raster from 18.8 s to 4.5 s and the frames over 25 ms from 95 to 17. Each far swap also starts a 180 ms cross-fade of about 54 layers in the middle of the zoom.

AFTER (2026-10-06). Same method, final run interleaved with a fresh before run against the same server (the before and after builds served side by side by a small proxy), medians of 3 runs each. Slow frame = over 25 ms.
GPU: wheel 14 of 328 slow, raster 1000 ms -> 0 of 275, 298 ms. Trackpad pinch 7 of 327, 968 ms -> 1 of 173, 127 ms (fewer frames because the pinch has no ease tail). Keys 0 of 132, 372 ms -> 0 of 122, 15 ms. Touch pinch: did not move -> follows the fingers, 0 of 97. Drag (control): 0 of 93 -> 0 of 91.
Software: wheel 73 of 465, raster 17825 ms, commit 2120 ms -> 1 of 378, 2109 ms, 226 ms. Pinch 52 of 467, 16617 ms -> 1 of 199, 1964 ms. Keys 1 of 147, 4576 ms -> 1 of 121, 424 ms. The one slow frame after is the frame at rest that draws the picture sharp again (85 to 100 ms in software only, not on the GPU); a released drag had the same frame before.
Which it was: the ease was not the cost. The cost was the picture painted and rasterized again at every zoom step, and the far swap with its 54-card cross-fade in the middle of a zoom. So the wheel and the keys keep their ease; only the pinch lost it, as the owner asked.
What changed: a pinch (ctrl-wheel and two touch pointers, with touch-action none on the viewport) moves the camera at once through pinchCamera in lib/camera.ts. The camera store (now lib/camera-store.ts) says whether a hand moves the camera and where it last came to rest; it rests once the ease has ended and the hand has left it alone for EXPLORING_MS.cameraRest (400 ms, which replaces trafficRest). While it moves, the surface carries will-change-transform; at rest the class goes and the picture is drawn sharp once. The far view reads the rest, so a zoom swaps the cards once, at rest, with the picture's own fade. The traffic waits on the same rest.
Not changed: React still renders CameraSurface once per frame of an ease (a few hundred microseconds a frame in the trace, not the cost); the picture's own drawing (renderer) was not touched. Every zoom frame still lays out the SVG text again (about 5 ms a frame: Blink lays out SVG text again when the scale of an ancestor changes); that cost stays on the main thread, but it is within a frame at 60 Hz on the GPU setup.
Tests: camera-motion (pinch arithmetic), semantic-board-stage (a trackpad pinch and a two-finger pinch move the camera at once and ask for no frame; a keyed zoom keeps the far view and the layer until rest, then drops both), semantic-board-traffic-rest (renamed duration). Checks: type-check, lint, fmt:check, bun test --isolate src/runtime/semantic-renderer src/transformers src/shared src/ui (1882 pass).

Whole serial browser lane after the commits (bun run build:frontend, then bun tests/system/browser/run-browser-lane.ts ...): 24 pass, 0 fail. Commits: b2a6c1b0d (feature), e4241f29f (ADR 0042 amendment).

Architecture completion (2026-10-07): Board viewer@TASK-405 adopted at version 51. Added the bound Camera controller (use-board-camera.ts) and Camera store (camera-store.ts); existing camera geometry, gesture, motion, dive and transition ids remain. Six existing relationships retain their ids and now land on, or originate at, the actual controller. Evidence: use-board-camera.ts:272 creates the store, :310 creates useCameraMotion, :376 applies pan, :387 applies pinch immediately, :497 applies ctrl-wheel immediately, :321 schedules rest, and :241 separates layer removal from the near/far swap by a frame. camera-store.ts:88 holds rest while moving or held; CameraSurface.tsx:29 keeps the transform layer while moving; SemanticDiagram.tsx:300 reads rest.scale. Three new relationships describe controller arithmetic, store access and frame-clock rest. The proposal comparison preserved every existing subject id, and the predecessor stayed byte-for-byte unchanged before adoption. Rasterized the proposal and inspected it. ARCHBOARD_URL=http://127.0.0.1:3447 ./bin/dogfood check passed with diagnostics: []. The 3447 server was isolated because another checkout owns the shared 3000 server. No acceptance criteria or status changed by this documentation work.
<!-- SECTION:NOTES:END -->
