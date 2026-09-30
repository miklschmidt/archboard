---
id: TASK-304
title: 'Record a walkthrough to a video file, narrated by the voice'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
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
- [x] #1 archboard semantic record <board> writes an MP4 or WebM file of one walkthrough, presented in one pane at 1920x1080 without the shell and narrated by the Codex voice. Each step moves on once the voice has finished explaining it, and the recording ends after the last step
- [x] #2 With --discard the board is deleted once its recording has been written; a failed recording keeps it
- [x] #3 A recording never stops or replaces voice that is live on the canvas; it is refused with the reason
- [x] #4 Every failure the recorder can reach names what happened and what to do next: no browser, Codex not signed in, voice unavailable, the voice silent on a step, board or walkthrough missing
- [x] #5 CONTEXT.md, DESIGN.md, an ADR, the archboard skill and TESTING.md say what a recording is and how to make one
- [x] #6 Covered by module owners for pacing and the recording start, and by one system owner that records a walkthrough end to end against the fake Codex. Verified with a real voice session
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared contracts first (56c4253e): the page contract in src/shared/walkthrough-recording, realtimeStart.presentation.recording, recording timings.
2. In parallel: .01 shared headless Chromium module, .02 discard through the store, .03 recording voice start (implementers in worktrees, each reviewed), and .04 the recording page (frontend, by me).
3. .05 the CLI command on top of them; .06 the fake Codex narrating and one end-to-end system owner, plus docs.
4. Real-voice recordings on a private signed-in canvas; review by scope and boundary; full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real-voice verification 2026-09-23 on a private canvas with a short-lived copy of the Codex sign-in (the access token was valid to 2026-09-25 and Codex refreshes only within 5 minutes of expiry; the copy was deleted each time): the dogfood 'Read this board' walkthrough recorded to MP4 in light (96 s) and dark (81 s) and after a cold canvas start (91 s), and a disposable 3-step board recorded to WebM (58 s) and discarded. Speech on every step, pauses of about 3 s in which the next step glides in, a 1.3 s mid-step pause correctly not taken as the end, the last turn closing the talk without inviting questions, every frame 1920x1080. Review: 21 findings from 5 scope and boundary reviewers, 19 confirmed by adversarial verifiers and fixed; the real run then found the recording pane refused its own board by client id on a many-board vault, fixed in 9d047b20 with the end-to-end owner made to fail on it. Full bun run check exit 0 (modules 3373, system 177, repository 8, every browser owner) before that last fix; the recording owners and engine owners pass after it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Agents can now record a board's walkthrough to a narrated video: archboard semantic record <board> --out talk.mp4|.webm [--walkthrough] [--variant] [--theme] [--discard --doing]. The CLI runs the canvas's own page in a private headless Chromium; the page shows one pane at 1920x1080 without the shell, captures its own tab with the Codex voice mixed in, and moves to the next step once the voice's transcript line is final and its output has gone quiet (the completed-item signal the user pointed at, plus the audio, since a line can end before its sound). The server gives a recording its own voice prompt and coordinator rule, no filler, and refuses it while voice is live; the recording pane is hidden from pane addressing and other browsers' subtitles. --discard deletes a board made for the video through the store after the file is written. Remotion was not used: the canvas animates on wall-clock time and the voice is live. Verified by module, system and end-to-end owners against a narrating fake Codex, the full gate, and four real-voice recordings.
<!-- SECTION:FINAL_SUMMARY:END -->
