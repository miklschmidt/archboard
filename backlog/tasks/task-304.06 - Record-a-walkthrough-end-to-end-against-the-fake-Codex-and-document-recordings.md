---
id: TASK-304.06
title: >-
  Record a walkthrough end to end against the fake Codex, and document
  recordings
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 10:31'
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
- [ ] #1 The fake Codex answers every appendSpeech with a spoken transcript, and its answer to a WebRTC offer is one a real browser accepts
- [ ] #2 One system owner runs semantic record against an owned canvas and checks that the file is a video that visited every step, and that --discard removed the board
- [ ] #3 CONTEXT.md, DESIGN.md, a new ADR, the skill and TESTING.md describe recordings, with a real-voice acceptance script
<!-- AC:END -->
