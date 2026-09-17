---
id: TASK-250
title: 'Present a walkthrough as a cinematic, step-by-step mode of the pane'
status: To Do
assignee: []
created_date: '2026-09-17 08:24'
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
- [ ] #1 A walkthrough opens as a presentation of the pane: the diagram fills the frame and the current step's title, description and position (for example 2 / 6) are part of the frame
- [ ] #2 Steps change only by explicit input: arrow keys or Space, previous/next controls, or choosing a step; scrolling never changes the step
- [ ] #3 Escape leaves the presentation and restores the camera and view the reader had before it
- [ ] #4 Subjects outside the step recede under a veil, and the veil cross-fades as the step changes
- [ ] #5 The camera glides between steps with a zoom-aware flight whose duration lives in src/shared/timing/timing.ts
- [ ] #6 A step that reads the board through another view carries the subjects both views share into place in time with the camera, instead of bringing in a new picture
- [ ] #7 Reduced motion cuts every step change, veil change and view change
- [ ] #8 The pane exposes when a step has finished arriving, so something driving the presentation can wait for it
- [ ] #9 The scroll-driven rail is removed, and rendered browser owners cover stepping, leaving and landing
<!-- AC:END -->
