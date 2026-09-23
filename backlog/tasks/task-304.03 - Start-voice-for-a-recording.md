---
id: TASK-304.03
title: Start voice for a recording
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
labels:
  - voice
  - codex
dependencies: []
parent_task_id: TASK-304
ordinal: 533000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A recording is narrated with nobody listening live and nobody at the controls. The voice model has to explain each step it is handed, never hand off, invite questions or fill silence, and it must not begin before the page has started capturing. The canvas has one voice session; a recording started from a headless page must not stop somebody who is talking.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 realtimeStart can mark a narration as a recording; the voice prompt then says the talk is recorded, explains each step as it arrives, and ends after the last step with one closing sentence
- [ ] #2 A recording start sends no delegation acknowledgement filler and does not open step 1 itself: the page moves to each step, and the server hands every step to the voice as it does a step chosen by hand
- [ ] #3 A recording start is refused while a voice session is live on the canvas, and the refusal says why
<!-- AC:END -->
