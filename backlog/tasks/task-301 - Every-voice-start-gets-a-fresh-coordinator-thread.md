---
id: TASK-301
title: Every voice start gets a fresh coordinator thread
status: To Do
assignee: []
created_date: '2026-09-22 21:26'
labels:
  - voice
  - codex
dependencies: []
ordinal: 521000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read from the recorded sessions on 2026-09-22: the coordinator thread is created per canvas run (child epoch) and reused by every voice session started in that run; four runs between 2026-09-07 and 2026-09-21 put two voice sessions on one coordinator thread. The user ruled that each voice start gets a new coordinator thread. A reused thread carries the previous talk's hand-overs, by-hand step notices and presentation-mode instructions into the next session, where they read as live history (for example which step a narration stands on, or that the user asked for Danish).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Starting voice creates a new coordinator thread, and the previous session's coordinator thread is never resumed by a later voice start
- [ ] #2 A coordinator turn or workhorse operation still running when voice stops is not lost: it is finished, cancelled or reported by an owner that is named in the task notes
- [ ] #3 The pane's thread link and anything the browser shows about the coordinator follow the new thread
- [ ] #4 Covered by a coordinator lifecycle owner, and verified with two consecutive voice starts in one canvas run producing two coordinator rollouts
<!-- AC:END -->
