---
id: TASK-304.06
title: >-
  Record a walkthrough end to end against the fake Codex, and document
  recordings
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
labels:
  - cli
  - voice
  - docs
dependencies:
  - TASK-304.05
parent_task_id: TASK-304
ordinal: 536000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deterministic owners cannot hear a voice, but the whole pipeline can run end to end against the fake Codex: a real headless Chromium and a real page, with the fake speaking a transcript for every step it is handed. The real-voice run is a human acceptance, like the narration one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The fake Codex answers every appendSpeech with a spoken transcript, and its answer to a WebRTC offer is one a real browser accepts
- [x] #2 One system owner runs semantic record against an owned canvas and checks that the file is a video that visited every step, and that --discard removed the board
- [x] #3 CONTEXT.md, DESIGN.md, a new ADR, the skill and TESTING.md describe recordings, with a real-voice acceptance script
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move the fake Codex's realtime behaviour into fixtures/fake-codex-realtime.ts (reached through the data module, which copiers import by absolute path); a narrates control makes it answer a real browser's offer with a crafted SDP answer (ICE stays new) and speak one line per appendSpeech; one system owner runs the real CLI, a real headless Chromium and the real page and checks the MP4, step order, each step finished before the next, and --discard. Docs: ADR 0035, CONTEXT (Recording), DESIGN section 2, TESTING, a real-voice acceptance script, the skill's walkthrough reference, the authored contracts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Committed 0abf8817. The end-to-end owner (tests/system/canvas-state/walkthrough-recording.test.ts) passed first run in about 10 s. Dogfood boards updated in 2f756259.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The fake Codex's realtime behaviour lives in fixtures/fake-codex-realtime.ts; told to narrate it answers a real browser's offer with an SDP answer it accepts (ICE stays new) and speaks one line per appendSpeech. tests/system/canvas-state/walkthrough-recording.test.ts runs the real CLI, a headless Chromium and the built page against it, with another board first so the page must ask for its own, and checks the MP4, step order, each step finished before the next and --discard. ADR 0035, CONTEXT (Recording), DESIGN section 2, TESTING, test-suite, the authored contracts, the skill and docs/design/walkthrough-recording-acceptance.md describe recordings.
<!-- SECTION:FINAL_SUMMARY:END -->
