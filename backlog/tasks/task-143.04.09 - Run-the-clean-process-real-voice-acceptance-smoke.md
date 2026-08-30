---
id: TASK-143.04.09
title: Run the clean-process real voice acceptance smoke
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:36'
labels: []
dependencies:
  - TASK-143.01.15
  - TASK-143.02.05
  - TASK-143.04.07
references:
  - TESTING.md
modified_files:
  - docs/design/codex-workbench-voice-acceptance.md
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the reproducible human-run acceptance procedure for real audio and exact Codex 0.151.0 at `docs/design/codex-workbench-voice-acceptance.md`. This finalization leaf is the only owner of the nondeterministic microphone/service smoke.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The procedure starts a clean Archboard process and dedicated signed-in home, verifies exact 0.151.0/effective SQLite readiness, and records prerequisites and actionable failure evidence.
- [ ] #2 The smoke proves real audio, a quick capable coordinator answer, one bounded board write, busy-workhorse queue or permitted steer, semantic callback speech, one eligible spoken approval with visual fallback, Stop, serialized restart, and graceful shutdown.
- [ ] #3 The procedure distinguishes automated gates from manual observations, records no credentials or derived media, and requires all deterministic module, process, build, and browser owners to pass first.
<!-- AC:END -->
