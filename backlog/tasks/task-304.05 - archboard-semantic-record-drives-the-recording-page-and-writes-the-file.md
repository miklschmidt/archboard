---
id: TASK-304.05
title: archboard semantic record drives the recording page and writes the file
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
labels:
  - cli
dependencies:
  - TASK-304.01
  - TASK-304.02
  - TASK-304.03
  - TASK-304.04
parent_task_id: TASK-304
ordinal: 535000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
External agents need one command that turns a board's walkthrough into a video file: pick the walkthrough, run the page in a private headless Chromium on the canvas the CLI talks to, wait for it while reporting progress, write the file, and optionally discard the board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 semantic record <board> --out <file.mp4|.webm> [--variant] [--walkthrough <name|id>] [--theme] [--discard --doing] writes the video and answers with a receipt: file, walkthrough, steps, duration, bytes, and whether the board was discarded
- [x] #2 The walkthrough may be omitted when the variant states exactly one; otherwise the refusal lists them
- [x] #3 Progress is reported step by step while the recording runs, and an interrupt stops the browser and writes nothing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
semantic record <board> --out <.mp4|.webm> [--walkthrough] [--variant] [--theme] [--discard --doing]: resolve the variant and walkthrough (named, or the only one; refusals list them), refuse --discard without --doing before recording, run src/runtime/walkthrough-recorder: a private headless Chromium with --screen-info, --auto-accept-this-tab-capture, autoplay allowed and a silent WAV as the fake microphone (granted over DevTools), a 1920x1080 window, prefers-color-scheme for the theme, then drive the page (ready, start with a user gesture, follow and report steps, keep the window at the reference size, stall watchdog), stream the file to a partial path and rename; discard after the file is written. Refusals RECORDER_UNAVAILABLE, RECORDING_REFUSED, RECORDING_FAILED, DOING_REQUIRED.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Committed 5f9f5e10 and c307fe78. Real-voice runs on a private canvas with a copied sign-in (access token valid to 2026-09-25, Codex refreshes only within 5 minutes of expiry, so the copy could not rotate the user's refresh token; the copy was deleted afterwards): dogfood 'Read this board', 4 steps, light 96 s and dark 81 s, speech per step (about 17-22 s each) with ~3 s pauses in which the next step glided in, a 1.3 s mid-step pause correctly not taken as the end, the last turn closing the talk ('That's the tour.') with no question, the microphone frames near-zero silence.

Criterion 1 reworded: the variant is chosen with --variant, as semantic render and rasterize take it, rather than name@variant.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard semantic record starts a private headless Chromium on the canvas the CLI talks to, drives the recording page through its contract, keeps the window at the reference size, reports each step, streams the file out and moves it into place only after the browser has stopped, then discards the board with --discard at the version it read (a refused discard answers discarded:false). Refusals: RECORDER_UNAVAILABLE, RECORDING_REFUSED (nothing recorded yet), RECORDING_FAILED, DOING_REQUIRED and usage errors for a missing walkthrough or --out directory; an interrupt anywhere stops the browser and writes nothing. Verified by the drive owner (interrupt mid-call), tests/system/canvas-state/walkthrough-recording-refusals.test.ts, the end-to-end owner, interrupt probes, and real-voice runs (cold start included).
<!-- SECTION:FINAL_SUMMARY:END -->
