---
id: TASK-382
title: A recording's picture renders in no more time than its talk took
status: To Do
assignee: []
created_date: '2026-09-30 04:27'
labels:
  - recorder
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 666000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-381 made a recording two passes: the live talk, then its picture rendered frame by frame in software headless Chromium. On 2026-09-30 a real recording of the web-shop walkthrough (85.3 s, 2560 frames) rendered in 211 s, about 83 ms a frame, so an agent waits about 2.5 times the talk again after the voice is done. TASK-381 deferred faster rendering until a measurement showed more than about twice the talk; this one does. The render is sequential because a step does not begin at rest (subtitles linger across steps, traffic runs continuously), so a second page must fast-forward to its first frame. Options named in the TASK-381 design (docs/adr/0041): split the frames across a few pages, each playing the talk forward uncaptured to its range, and multiplex their JPEGs into one ffmpeg in order; or reuse the last JPEG when a frame changes nothing (no event, no running animation, no SMIL, no pending frame request). Frames must stay byte-identical to the sequential render.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A real recording of the web-shop walkthrough renders its picture in no more time than its talk lasted, measured on a quiet machine
- [ ] #2 Two renders of one talk give byte-identical frames, as walkthrough-replay.test.ts holds
- [ ] #3 A render still fails as RENDER_FAILED and keeps the talk when a frame cannot be drawn
<!-- AC:END -->
