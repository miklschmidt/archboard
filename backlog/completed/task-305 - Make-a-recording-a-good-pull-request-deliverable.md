---
id: TASK-305
title: Make a recording a good pull request deliverable
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 12:46'
updated_date: '2026-09-24 01:40'
labels:
  - cli
  - docs
dependencies: []
priority: high
ordinal: 537000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The primary use of a recording is as an artifact on a pull request, so a reviewer can understand the work the PR did (the user, 2026-09-23); it stays a general feature. Two things stood in the way. MediaRecorder writes MP4 sound as Opus on Linux (Chromium and Google Chrome alike: Chrome encodes AAC only through the operating system), and Safari does not play Opus in MP4, so a reviewer on a Mac would get a silent video. And nothing told an agent how to shape a board for a reviewer or how to get the file onto the PR; gh 2.99+ attaches MP4, MOV and WebM to PRs and comments (10 MB on free plans, 100 MB on paid).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An MP4 recording plays with sound in Safari: with an ffmpeg on PATH or named by ARCHBOARD_FFMPEG, Opus sound is converted to AAC with the picture copied untouched and the index moved to the front; without one, the command says the sound will not play in Safari and how to fix it
- [x] #2 The skill teaches a pull request recipe: a disposable board whose PR variant shows its comparison with the state before, a short walkthrough written for a reviewer, record with --discard, attach with gh pr comment --attach within the size limit, never commit the video
- [x] #3 Verified: an MP4 recorded on this machine has AAC sound, and a PR-shaped disposable board was recorded with the real voice
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. walkthrough-recorder: optional ffmpeg (ARCHBOARD_FFMPEG, else PATH) converts an Opus MP4 to AAC (-c:v copy -c:a aac -movflags +faststart) before the file moves into place; a failed conversion keeps the Opus file and says so; no ffmpeg says so. Timing bound in src/shared/timing.
2. Skill: a PR section in the walkthrough reference and a route from SKILL.md; ADR 0035, INSTALL.md and the acceptance run say the same.
3. Owner: playable.test.ts for the conversion's outcomes; the e2e lane has no ffmpeg, so AAC is checked once by hand. Real-voice run of a PR-shaped board: acceptance section 4.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Conversion (85bba178): src/runtime/walkthrough-recorder/lib/playable.ts, called by recordedWith after the browser stops and before the file moves into place; bounded by RECORDING_SOUND_CONVERT_MS. Owner: lib/tests/playable.test.ts (no ffmpeg, an ffmpeg that fails, one that cannot start: file untouched and one note; WebM and AAC MP4 untouched). The e2e owner does not check AAC: it would need an ffmpeg in the lane, and a temporary probe of it with ARCHBOARD_FFMPEG set to the Nix ffmpeg 9.0.1 gave h264 + aac and faststart; without ffmpeg the receipt stayed Opus with the note.
Skill (5c4fea8f) and docs (fb74e932: ADR 0035 'It plays with sound wherever it is watched', INSTALL.md 'Recording a walkthrough', acceptance run section 4).
Recipe followed literally on a private canvas with a scratch copy of the tracked vault: new -> version 1, branch --expect-version 1 -> 2, change edit -> 3, walkthrough edit -> 4 as the recipe's block states; compare: 2 parts added, 4 relationships added, 2 changed, 5 beats; the draft's rasterized picture marks added parts and relationships green and changed ones orange (the pane's comparison defaults on, SemanticBoardStage.tsx:396); record on a canvas without Codex refuses with exit 4 naming the sign-in and keeps the board.
Not done: the real-voice PR-shaped recording (AC3 second half). Copying the Codex sign-in into a private canvas was refused by the permission classifier, and the user's own canvases are not for agent verification. It is acceptance run section 4 in docs/design/walkthrough-recording-acceptance.md.

User run 2026-09-24 of the pull-request acceptance script (a disposable pr-check board, a "This pull request" branch with a change and a five-step reviewer walkthrough, recorded with --discard) with the real voice: ffprobe reports codec_name=h264|codec_type=video and codec_name=aac|codec_type=audio, and the user watched the video and called it perfect.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A recording is a pull request deliverable: the MP4 carries AAC sound when ffmpeg is at hand, so it plays in Safari, and the skill teaches the recipe (a disposable board whose branch shows the change, a reviewer's walkthrough, record with --discard). Verified by the user recording a PR-shaped board with the real voice: h264 video, AAC sound, every step narrated.
<!-- SECTION:FINAL_SUMMARY:END -->
