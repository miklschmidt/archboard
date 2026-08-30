---
id: TASK-143.04.09
title: Run the clean-process real voice acceptance smoke
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:58'
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
Own the reproducible clean-process human acceptance procedure for exact Codex 0.151.0 text plus real audio. Deterministic module/process/browser owners must pass first. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The procedure starts clean Archboard/dedicated signed-in roots, proves config.toml/effective SQLite and exact version, creates/links a workhorse, submits text, observes authoritative timeline, interrupts a turn, and recovers after reconnect without duplicate input.
- [ ] #2 The voice path proves real audio, quick capable coordinator response, one bounded board write, queue or permitted steer, semantic callback, one final-user-derived eligible spoken approval with visual fallback, Stop, restart, and shutdown.
- [ ] #3 It distinguishes automated gates from manual observations, records no credentials/media, captures actionable failure evidence, and requires every deterministic owner before the smoke.
<!-- AC:END -->
