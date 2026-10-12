---
id: TASK-469
title: '`semantic record` and `semantic replay` take a layout engine'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-12 00:35'
updated_date: '2026-10-12 01:04'
labels: []
dependencies: []
priority: medium
ordinal: 814000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stills can be drawn with the Blocks layout (`--layout blocks`) but a recorded walkthrough is always drawn with Track, so the video and the pictures beside it in the same pull request show different layouts of the same board. Narrated walkthroughs should be able to use the layout the reviewer sees in the stills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `semantic record` and `semantic replay` accept `--layout track|blocks`, with the default unchanged
- [x] #2 A recording or replay with `--layout blocks` is laid out by Blocks in every frame, and the talk keeps which layout it used so a replay draws the same one
- [x] #3 The recording and replay cost with Blocks on a big board is measured and stated; a frame never waits on a layout that the voice has already moved past
- [x] #4 Tests cover the option reaching the frames and the stored talk; the `archboard` and `archboard-pr` skills drop the sentence that says videos are always Track
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The talk states its layout engine: TalkSchema.layout, default track, so a talk kept before reads as Track. ReplayOptions carry the layout to the replay page, which chooses that engine before it mounts the stage, through chooseLayoutEngine exported from semantic-board-canvas.
2. semantic record --layout, default track, keeps it in the talk and renders with it. semantic replay --layout overrides, else the talk's layout. Both receipts name the layout.
3. The live pass stays on the default engine: its picture is never captured, only its pacing, so a slow Blocks layout there would only add silence.
4. Tests: talk contract keeps the layout and reads an old talk as Track. walkthrough-recording system owner records with --layout blocks and checks the kept talk and receipt. walkthrough-replay owner replays a Blocks talk by default and with --layout track, a different first frame.
5. Measure a real Blocks recording on Board viewer and a multi-view replay on Archboard server. Fix frame stalls only if measured.
6. Skills: archboard-pr walkthrough.md and SKILL.md drop the Track-only note and pass --layout blocks. archboard sequences-views-walkthroughs names --layout.
No board affected: no part or relationship is added, removed or rewired. walkthrough-replay already reads the semantic viewer, and record and replay already call the recorder.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-10-12 on this 24-thread machine, a server on a copy of the dogfood vault, ffmpeg through Nix. One real recording with Codex voice: Board viewer, walkthrough Read one semantic board, 5 steps, --layout blocks. Talk 129.2 s of video, 3877 frames, 9.8 MB; the talk pass took 131 s and the frame render 156 s, 292 s in all. Replays of that kept talk: Track 150.5 s, Blocks 154.5 s; the first second of frames reached ffmpeg at 8.8 s with Track and 20.7 s with Blocks, the first Blocks layout of the whole board. A synthetic talk of Archboard server, How the backend serves a board, 7 steps across 5 views, 48 s, silent voice: Track 27.7 s, Blocks 31.3 s. Every render finished; no frame came near the 30 s RECORDING_FRAME_READY_MS bound. Frames from both engines were looked at: the Blocks video draws the Blocks picture.
Decision, no stall fix: the frames are drawn on the replay page's stepped clock, which stands still while a layout runs, and the voice is placed by sample from the talk. So a slow layout makes the render take longer and never makes the video wait or the voice run ahead of the picture. Each page lays a view out once and its query cache reuses it for every later frame. The measured extra cost is 4 s on a 150 s render, so a cross-page layout cache would add a mechanism for no visible gain.
Decision, the live pass stays on the default engine: its picture is never captured, only its pacing and the voice, so drawing Blocks there would only delay the board and add silence to the talk.
Decision, the talk's layout defaults to track when absent and TALK_VERSION stays 1: every talk kept before was drawn with Track, and the newest ten in the state directory stay replayable. An older archboard refuses a talk that states a layout, because the talk schema is strict.
No board is affected: no part or relationship is added, removed or rewired.

Validation: bun run check exit 0 at 68046b7b6 plus e1533d6c2. test:modules 4505 pass 1 skip 0 fail; test:system 198 pass 0 fail; test:repository 27 pass 0 fail; test:serial-browser 19 of 19 owners exit 0. The new replay case fails with the layout line in replay-page.ts disabled and passes with it. Help shows --layout on both commands, record defaulting to track.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic record and semantic replay take --layout track|blocks. The talk keeps the layout it was recorded with, reading as Track for a talk kept before, and replay draws it unless --layout names the other; both receipts name the layout. The replay page chooses the engine before it mounts the stage; the live pass keeps the default engine because its picture is never captured. Measured on Board viewer with a real Codex recording: a 129 s talk renders in 150.5 s with Track and 154.5 s with Blocks. A 7-step, 5-view Archboard server talk renders in 27.7 s and 31.3 s. Frames are drawn on a stepped clock that stands still during a layout, so no frame waits behind the voice and no stall fix was needed. Verified by talk.test.ts (layout kept, old talk reads Track), walkthrough-recording.test.ts (records with --layout blocks, talk and receipt say blocks), walkthrough-replay.test.ts (a Blocks talk replays as Blocks by default, --layout track gives another first frame), and bun run check. The archboard-pr and archboard skills record with --layout blocks and no longer say videos are always Track.
<!-- SECTION:FINAL_SUMMARY:END -->
