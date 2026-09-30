---
id: TASK-381
title: A recording renders its picture frame by frame against the talk it recorded
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-30 02:38'
updated_date: '2026-09-30 03:24'
labels:
  - voice
  - renderer
dependencies: []
priority: high
type: feature
ordinal: 665000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user decided on 2026-09-30 to record a walkthrough in two passes, after comparing Archboard's recorder with Remotion's capture pipeline: it improves the product. Today one live pass paces the walkthrough on the Codex voice and captures the page's own tab with getDisplayMedia and MediaRecorder (ADR 0035). Its frames depend on Chromium's capture and compositor: TASK-378 needed a repaint layer, GPU compositing and a shader warm-up to keep holds under 50 ms, and a machine without a GPU still holds 57 to 75 ms in view-change glides. In two passes, the live pass records the talk (the voice's audio and each step and subtitle event on one clock) and a second pass renders the picture frame by frame against that recording on a controlled clock, with no Codex and no capture, so every frame is drawn and none is dropped, whatever the GPU or the load. A recorded talk can then be rendered again (another theme, a sharper picture, after a renderer fix) without a new voice session.

Decision of the user: the encoder is ffmpeg. The recorder uses ffmpeg when it is available (ARCHBOARD_FFMPEG or PATH), runs it through nix when it is not, and refuses with an error that names both when neither is there. This replaces ADR 0035's rules that the picture is encoded only in the browser and that ffmpeg is optional.

Research: /home/msc/.claude/jobs/87eee52a/tmp/two-pass-brief.md (a working file of the planning session; the plan records what it needs).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A recording's video has one fully drawn frame every 1/30 s, with no frame held, on a machine with or without a usable GPU and under load
- [ ] #2 The voice and each step and subtitle line up with the picture within one frame
- [ ] #3 A recorded talk can be rendered again, for example in the other theme, without a new voice session
- [ ] #4 The recorder finds ffmpeg, runs it through nix when it is missing, and refuses with an error naming both when neither is there
- [ ] #5 ADR 0035, the recording docs and the affected boards describe the two passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Two passes (ADR 0041, drafted as proposed; it supersedes ADR 0035 at close).

Pass 1 (live) keeps the pacing on the voice and captures no picture. The page records a talk: the voice as 48 kHz mono PCM through an AudioWorklet tap, and an event log stamped in samples of that same audio clock (step, said, drawn, end). The CLI writes the talk atomically as talk.json + voice.wav with the board document and vault check it was drawn from, to stateDir()/recordings/<stamp>-<board>/ (newest 10 kept) or to --talk <dir>. A drawn version other than the board's fails pass 1 with "record again".

Pass 2 (offline, no Codex) opens the Archboard server's page as /?replay=1 in software-rendered headless Chromium. The replay page mounts the same recording stage, board stage and subtitles, reads the board and policy from the talk (board-reads port), and drives every moving picture from a stepped frame clock. For each frame n at t = n/30 s it applies the events due, advances the clock, waits until the picture at that step and version is drawn and quiet, runs the frame, syncs every animation and SVG clock, and waits one real paint. Anything that moves outside the clock fails the render. The CLI captures each frame with Page.captureScreenshot (JPEG q92) and pipes it into ffmpeg (libx264 CRF 18 medium + AAC for MP4, VP9 + Opus for WebM), audio padded to exactly N*1600 samples, so picture and voice align by construction.

ffmpeg: ARCHBOARD_FFMPEG, then PATH, then nix run nixpkgs#ffmpeg-headless (machine registry), else ENCODER_UNAVAILABLE naming both. New command: archboard semantic replay <talk> --out <file> [--theme]. --scale 2 and parallel rendering are deferred (parallel only if a measured render exceeds about 2x the talk).

Stages, each gate-green and committed:
1. ffmpeg resolver and probe, required before any browser starts. Done (02ff5080).
2. Frame clock (src/ui/frame-clock) and the viewer seams, lint keeps the viewer off the browser's timers. Done (9b8ded9f).
3. Talk contract (src/shared/walkthrough-recording/talk.ts), board-reads port, talk playback (src/ui/walkthrough-replay).
4. Replay page, openVideoEncoder, lib/render.ts renderTalk, semantic replay command; system owner renders a fixture talk twice to identical frame hashes, with a board the server does not have.
5. Pass 1 records the talk (talk-capture, worklet tap), record runs both passes; tab capture, rehearsal, playable and the frame pacer are deleted.
6. Docs (ADR 0041 accepted, 0035 superseded, INSTALL, TESTING, acceptance doc, consumer skill), real recordings, boards adopted.

Board proposals: Board rasterizer@TASK-381, Command interface@TASK-381, Browser application@TASK-381, Board viewer@TASK-381, Archboard@TASK-381.
<!-- SECTION:PLAN:END -->
