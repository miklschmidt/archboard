---
id: TASK-304
title: 'Record a walkthrough to a video file, narrated by the voice'
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
labels:
  - voice
  - frontend
  - cli
  - codex
dependencies: []
priority: high
ordinal: 530000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents working in consumer repositories want to hand a user a short video that explains an architecture, such as the change a pull request makes, without the user having to sit through a live narration or keep the board afterwards. The user noticed that the voice model's transcript line turns into a completed item when it has finished speaking, which is the signal a recording can step on: present a step, let the voice explain it, move on when it has finished, and capture the picture and the voice into one file.

Constraints found while designing it (2026-09-23): voice audio is a WebRTC track that only the page receives, so capture must happen in the page. Headless Chromium can capture its own tab with getDisplayMedia (preferCurrentTab and --auto-accept-this-tab-capture) at 1920x1080 and 30 or 60 fps. MediaRecorder writes MP4 (H.264 with Opus) or WebM directly, so ffmpeg is not needed. Tab audio is silent in headless mode, so the voice has to be mixed in from its own stream. --use-fake-ui-for-media-stream turns getDisplayMedia into 20 fps screen capture; grant the microphone through CDP instead. Remotion does not fit: the canvas animates on wall-clock time (rAF glides, CSS transitions, WAAPI, SMIL traffic), and the voice is a live session rather than pre-rendered audio. A recording runs on the canvas the CLI talks to, because that canvas owns the only signed-in Codex home, and one app-server holds a Codex home at a time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard semantic record <board> writes an MP4 or WebM file of one walkthrough, presented in one pane at 1920x1080 without the shell and narrated by the Codex voice. Each step moves on once the voice has finished explaining it, and the recording ends after the last step
- [ ] #2 With --discard the board is deleted once its recording has been written; a failed recording keeps it
- [ ] #3 A recording never stops or replaces voice that is live on the canvas; it is refused with the reason
- [ ] #4 Every failure the recorder can reach names what happened and what to do next: no browser, Codex not signed in, voice unavailable, the voice silent on a step, board or walkthrough missing
- [ ] #5 CONTEXT.md, DESIGN.md, an ADR, the archboard skill and TESTING.md say what a recording is and how to make one
- [ ] #6 Covered by module owners for pacing and the recording start, and by one system owner that records a walkthrough end to end against the fake Codex. Verified with a real voice session
<!-- AC:END -->
