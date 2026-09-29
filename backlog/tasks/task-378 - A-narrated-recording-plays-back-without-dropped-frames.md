---
id: TASK-378
title: A narrated recording plays back without dropped frames
status: To Do
assignee: []
created_date: '2026-09-29 18:33'
labels:
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 662000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recordings made 2026-09-29 one at a time on a quiet machine with archboard semantic record (1920x1080, 30 fps) hold a frame for 200 to 285 ms between 14 and 25 times in a 90 to 110 s video, mostly while only the subtitles and the traffic dots move. A performance trace of the same step change in a live pane showed no main-thread task over 30 ms, so the stalls come from the recording path: the recording page captures its own tab and encodes it. The README's narrated videos and their WebP excerpts carry these holds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A recording of a README walkthrough on a quiet machine holds no frame longer than 50 ms while anything on screen moves
- [ ] #2 The cause is named in the task notes, with the measurement that shows it
<!-- AC:END -->
