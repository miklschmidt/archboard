---
id: TASK-250
title: 'Present a walkthrough as a cinematic, step-by-step mode of the pane'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 08:24'
updated_date: '2026-09-17 09:01'
labels:
  - frontend
  - motion
  - ux
dependencies: []
references:
  - src/ui/semantic-board-canvas/components/SemanticNarrative.tsx
  - src/ui/semantic-board-canvas/lib/narrative.ts
ordinal: 437000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A variant's walkthrough is read today in a scrolling rail beside the diagram (TASK-178): the beat on screen is whichever one crossed a reading line a third of the way down the rail, so the picture changes as a side effect of where text happens to sit, and a long beat or the rail's bottom padding can put the wrong one on the line. The rail is plain prose in a bordered panel, and the diagram only rings the beat's subjects. The user wants the walkthrough to be a presentation: cinematic, with the step's title and description a prominent part of the picture frame, stepped explicitly rather than by scrolling, and gliding between steps. It is not a sidebar tab (TASK-249), because a voice agent is to present it next (see the voice presenter task), which needs a mode the pane can be driven into and out of. Motion builds on TASK-248 (pictures fitted before paint, entrances, and the data-picture-motion signal that a picture has landed) and TASK-246 (shared subjects carried between pictures of one board).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A walkthrough opens as a presentation of the pane: the diagram fills the frame and the current step's title, description and position (for example 2 / 6) are part of the frame
- [x] #2 Steps change only by explicit input: arrow keys or Space, previous/next controls, or choosing a step; scrolling never changes the step
- [x] #3 Escape leaves the presentation and restores the camera and view the reader had before it
- [x] #4 Subjects outside the step recede under a veil, and the veil cross-fades as the step changes
- [x] #5 The camera glides between steps with a zoom-aware flight whose duration lives in src/shared/timing/timing.ts
- [x] #6 A step that reads the board through another view carries the subjects both views share into place in time with the camera, instead of bringing in a new picture
- [x] #7 Reduced motion cuts every step change, veil change and view change
- [x] #8 The pane exposes when a step has finished arriving, so something driving the presentation can wait for it
- [x] #9 The scroll-driven rail is removed, and rendered browser owners cover stepping, leaving and landing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Timing: PRESENTATION_STEP_MS for a step's glide and veil cross-fade.
2. Camera: van Wijk zoom-aware glide (lib/camera), driven per frame on the surface and committed to state at the end; a bottom reserve for the caption; glide cancelled by a gesture; data-camera-motion while flying.
3. useAutoFit: while presenting, a new step glides (with the picture transition's duration when the step changes view); entering remembers the reader's camera and leaving glides back to it.
4. Picture transition: while presenting, pictures of one board through another view are carried, with no keepStill shift.
5. SemanticPresentation replaces the scroll rail: caption in the frame (counter, heading, body, missing subjects), previous/next and step dots, window keys (arrows, Space, PageUp/Down, Home/End, Escape), measured caption reserve; the sidebar steps aside; the veil reuses group-focus marks with a CSS cross-fade outside picture flights.
6. Stage exposes data-presentation-step; arrival = that step, no data-picture-motion, no data-camera-motion.
7. Tests: narrative stage tests rewritten for stepping; camera glide arithmetic; a browser owner for stepping, leaving and landing; remove rail helpers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Glide: van Wijk/Nuij smooth zoom path (lib/camera-glide.ts) driven per frame on the surface and committed to camera state once at the end; a gesture stops it where it is drawn. PRESENTATION_STEP_MS 900; a step that changes view glides on PICTURE_TRANSITION_MS while the picture is carried across views (presenting widens carriedOn to the same board, no keepStill shift). The caption reserves the bottom of the viewport for fits (measured, capped at 40%). The veil reuses group-focus marks for the step's subjects, cross-faded by CSS on .is-presenting outside picture flights. Arrival is exposed as data-presentation-step on the stage with no data-camera-motion / data-picture-motion on the surface. New type role text-presentation (28px) for the step heading. ADR 0023 amended; operator-canvas-shell.md and the consumer skill's authoring reference updated (groups are on the sidebar's Board tab).
Verified: 12 stage tests (stepping by keys/controls/dots, scroll never steps, veil and fit above the caption, view steps, missing subjects, reduced motion lands at once, glide attribute then landing, Escape restores camera and reported view, proposal keeps the step); camera-glide arithmetic tests; new browser owner semantic-walkthrough-presentation (keys, glide landing, computed opacity veil, controls, Escape restoring camera and sidebar); full serial browser lane 18/18; modules 3172; skill tests 127; lint, fmt, type-check. Recorded in headless Chromium and reviewed frames of a step glide.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Walkthroughs are presented instead of scrolled: the step's heading and words sit in a caption in the picture's frame, steps change by keys, controls or step dots, the camera glides along a zoom-aware path to each step while what it is not about recedes, a view-changing step carries shared cards in time with the camera, Escape restores the reader's camera and view, and reduced motion cuts it all. The pane exposes when a step has arrived for TASK-251. Verified with stage, glide and browser tests and the full browser and modules lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
