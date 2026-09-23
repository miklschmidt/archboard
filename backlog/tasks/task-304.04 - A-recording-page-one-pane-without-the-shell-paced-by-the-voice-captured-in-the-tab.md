---
id: TASK-304.04
title: >-
  A recording page: one pane without the shell, paced by the voice, captured in
  the tab
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
labels:
  - frontend
  - voice
dependencies: []
parent_task_id: TASK-304
ordinal: 534000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The page is where the voice is heard and where the position of a walkthrough belongs (ADR 0023), so it is the page that knows when the voice has finished explaining a step and that moves on. The page also captures its own tab together with the voice audio.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A page opened with a record parameter shows only the pane at 1920x1080: no shell, no sidebar, no subtitles, and a caption without controls
- [ ] #2 Once started with a user gesture it captures the tab and the voice into one MediaRecorder file, starts the voice as a recording, holds the overview briefly, and steps to each next step after the voice has finished the one on screen (a final transcript line and quiet output), ending after the last
- [ ] #3 It exposes its state (loading, ready, recording with the step, finished, failed with a reason) and the finished file to the recorder through one typed page contract
- [ ] #4 A step the voice says nothing about within a bound fails the recording with the reason
<!-- AC:END -->
