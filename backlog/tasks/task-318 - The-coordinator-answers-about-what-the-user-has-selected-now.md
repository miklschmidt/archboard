---
id: TASK-318
title: The coordinator answers about what the user has selected now
status: To Do
assignee: []
created_date: '2026-09-23 21:36'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/runtime/codex-coordinator-callbacks/lib/pane-news.ts
  - src/runtime/codex-instructions/coordinator-developer-instructions.txt
priority: medium
type: bug
ordinal: 550000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-23 23:15 session the user selected Headless Chromium, then Canvas server, and asked "Can you tell me more about this" and "can you see what I have selected now". The host told only the voice model ("The user is now looking at board Archboard, with Headless Chromium selected (data)."). A V3 handoff carries only the user's words, so the coordinator got "Can you tell me more about this" with no referent. Its own board context is refreshed only when the host starts a coordinator turn, and the last one (a workhorse outcome) showed no selection. It has no tool that reads a pane, and the CLI could not run in its sandbox (TASK-314). It answered from the stale context and said "I checked the live canvas context", which it had not. Related: TASK-293.06.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A voice question about "this" asked after the user selects something is answered about that selection
- [ ] #2 The coordinator never says it read the live canvas when it did not
<!-- AC:END -->
