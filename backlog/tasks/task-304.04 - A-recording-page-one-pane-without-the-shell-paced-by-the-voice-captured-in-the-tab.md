---
id: TASK-304.04
title: >-
  A recording page: one pane without the shell, paced by the voice, captured in
  the tab
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
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
- [x] #1 A page opened with a record parameter shows only the pane at 1920x1080: no shell, no sidebar, no subtitles, and a caption without controls
- [x] #2 Once started with a user gesture it captures the tab and the voice into one MediaRecorder file, starts the voice as a recording, holds the overview briefly, and steps to each next step after the voice has finished the one on screen (a final transcript line and quiet output), ending after the last
- [x] #3 It exposes its state (loading, ready, recording with the step, finished, failed with a reason) and the finished file to the recorder through one typed page contract
- [x] #4 A step the voice says nothing about within a bound fails the recording with the reason
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
A walkthrough-recording UI module: pure pacing (lead, step, tail; move on once every line the voice said since the step was asked for is final and the output level has been below speaking level for RECORDING_QUIET_MS; bounded waits fail with a reason), tab capture (getDisplayMedia preferCurrentTab at the page's own size, the voice mixed in from its stream through one Web Audio destination, MediaRecorder MP4/WebM), an audio-element port that hands the voice stream over, a recorder class publishing window.archboardRecording, and a shell-less RecordingStage. The application reads ?record= once, makes the recorder before the panes, gives the pane the recorder's own step (answers:false, so it reports answering:null and the server hands it to the voice) and hears its reading; the pane registers as neither primary nor focused. Caption controls hidden under data-recording.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Committed 90688a98. Found in real runs and fixed in c307fe78: Chromium draws a 56 px 'sharing this tab' bar 121 ms after capture begins, which made every frame 1920x1024; the capture now waits for the bar, the recorder re-fits the window, and the page writes nothing until it is back at its captured size (all frames 1920x1080 in the fake and the real run). Capture is VFR: 30 fps while anything moves, one frame a second when the picture is still. Owners: src/ui/walkthrough-recording/tests/pacing.test.ts (4), the own-step case in semantic-board-driven-presentation.test.tsx, and the end-to-end system owner.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A page opened with ?record=<walkthrough> shows only its pane at 1920x1080 (no shell, sidebar, subtitles or caption controls), captures its own tab with the voice mixed in from its WebRTC stream into one MediaRecorder file (MP4 H.264/Opus or WebM VP9/Opus), waits for Chromium's tab-sharing bar and writes nothing until it is back at its captured size, starts voice as a recording, holds the overview, and steps itself to each next step once every line the voice said about the step is final and its output has been quiet for RECORDING_QUIET_MS; only a step's first arrival is bounded. It publishes window.archboardRecording (state, start, file) from the shared contract, and every bounded wait fails with a reason. Verified by the pacing owner (5 cases), the own-step stage owner, the end-to-end owner (frames 1920x1080), and real-voice recordings of 4 and 3 steps in light, dark, MP4 and WebM.
<!-- SECTION:FINAL_SUMMARY:END -->
