---
id: TASK-375
title: >-
  A walkthrough step about rows far down a tall flow shows them readable, under
  the flow's participants
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 13:51'
updated_date: '2026-09-29 15:01'
labels:
  - renderer
  - viewer
dependencies: []
priority: high
ordinal: 659000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report 2026-09-29, after TASK-372: on tall flows such as Board rasterizer's One recording (walkthrough How a walkthrough becomes a video), a step that names some messages also lights the participants at their ends, and a participant's box is its whole column of time. So the camera fit the flow from its head to its foot, about 1,600 units into a 700-pixel pane, and nobody could read the rows the step is about. The user asked for a way to zoom and move the important parts into view, for example by moving the cards down and cropping the rows that are not in focus. The fix belongs to the viewer and the renderer. No board data changes (ADR 0023).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A presented step that names messages of one flow frames those rows from the top of the pane, at a size the flow's width allows, with the flow's participant cards directly above them
- [x] #2 A flow's participant cards stay in view while the camera shows rows further down, in a walkthrough and while a reader pans, and never go below the flow's last row
- [x] #3 Nothing the moved cards stand over shows through or around them, veiled or not, and the picture at rest and every rasterized picture are unchanged
- [x] #4 The cards follow the camera through a whole glide, not only where it lands
- [x] #5 The narrative stage tests own the framing and the moved cards, and the Board rasterizer walkthrough is checked in headless Chromium in both themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards: no board is affected. The sticky head is internal to the Sequence painter (Semantic renderer) and to the viewer's camera and stage nodes (Board viewer); no part or relationship is added, removed or rewired.
1. Renderer: each flow's participant cards are drawn in one group named for the flow (data-flow-head). Behind them lies the frame's ground (page ground plus the frame's band, standing with the frame), reaching HEAD_REACH above the cards, hidden in the picture and shown by the picture's own rule under .is-stuck.
2. Viewer geometry (lib/flow-head.ts): flowRows reads a flow's head top and first and last row from the atlas; headDrop moves the head to the top of the room the camera shows, clamped to the last row; flowFocus frames the rows a step lights, with the head above them as far above the first as the drawing sets it above its own first row, across the lit columns, and the same rows across the whole frame as context.
3. Camera: a focus fit may anchor its region at the top of the room; cameraOf reads a camera back off the transform cameraTransform writes.
4. use-sticky-heads: a MutationObserver on the surface's style places every head for the camera the surface is drawn with, so the head follows a glide frame by frame and a pan or a zoom; a moved head is raised over the picture, since the messages are drawn after it.
5. Owners: the flow-framing stage test (tall flow framed from the top with its head moved over the rows; the head back where it was drawn after leaving); the data-flow renderer test (the head group and its hidden ground).
6. Docs: operator-canvas-shell.md presentation paragraph and a sentence on reading tall flows.
7. Verify: bun run check, and the Board rasterizer walkthrough and a manual pan in headless Chromium in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned, with two changes found on the way. A CSS transition that moved the head per beat drifted about 70 px mid-glide, because the glide flies a zoom-out-and-in path; so the head follows the camera the surface is drawn with (MutationObserver on its style), which also keeps it in view while a reader pans. Messages are drawn after the head, so a moved head is raised over the picture, and the frame's ground behind it (hidden in the picture, shown under .is-stuck) hides what it covers without any tucking of rows. The camera takes an ordered list of contexts and shows the first that reads at 90% of the smaller of the focus's size and the drawing's own size: the whole flow from its title down to the lit rows, then the rows under the moved head across the flow's width. So a short flow (web shop) is read from its top with nothing moved, and only a tall one moves its head. Verification: semantic-board-flow-framing.test.tsx (whole width when cheap; own columns when the flow is far wider; a later message of a short flow read from the top with the head in place; a message far down a tall flow framed from the top of the room with the head moved by exactly the rows it passed and given back on leaving; the tall case fails with the sticky hook off); dataflow.test.ts (the head group and its hidden ground). bun run check exit 0: 3718 module tests, 182 system tests, repository and serial browser lanes green. Browser: headless Chromium, 1920x1080, scratch server on 3431. All three flow beats of How a walkthrough becomes a video are readable with the head over the lit rows, in light and dark; four frames taken mid-glide keep the head at the top; zooming in and panning down One recording by keyboard keeps the head in view; the web-shop walkthroughs read their short flows from the top with nothing moved; semantic rasterize of One recording is unchanged.

User decision 2026-09-29: a step about later messages of a short flow brings them up under the head too, rather than showing the flow from its title, because the rows above are room the step's rows could be read in (report on beat 1 of How a walkthrough becomes a video on a 2000x1550 pane, where the whole-flow context was chosen). The whole-flow context is gone; the fit target is back to one context (the rows across the flow's width). Verification: the flow-framing stage test now owns the short case (a later message of a short flow moves the head by exactly the rows before it); bun run check exit 0 (3718 module tests, 182 system tests, repository and serial browser lanes green); headless Chromium at 2000x1550 (dark) and 1920x1080 (light) shows the lit rows directly under the moved head on Board rasterizer and on both web-shop walkthrough steps.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A walkthrough step about messages of a flow now shows them readable, whatever the flow's height. The camera frames the lit rows from the top of the pane, across the flow's width when that reads nearly as large, and the flow's participant cards slide down their lifelines to stand directly above them, hiding the rows they pass over. The cards follow the camera frame by frame, through glides and while a reader pans, never go below the flow's last row, and stand on the frame's own ground. Rasterized pictures are unchanged. Verified with the flow-framing stage tests, the data-flow renderer test, bun run check (exit 0), and the Board rasterizer and web-shop walkthroughs in headless Chromium in both themes and two pane sizes.
<!-- SECTION:FINAL_SUMMARY:END -->
