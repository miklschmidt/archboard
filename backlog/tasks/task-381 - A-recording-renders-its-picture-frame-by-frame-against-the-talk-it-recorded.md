---
id: TASK-381
title: A recording renders its picture frame by frame against the talk it recorded
status: To Do
assignee: []
created_date: '2026-09-30 02:38'
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
