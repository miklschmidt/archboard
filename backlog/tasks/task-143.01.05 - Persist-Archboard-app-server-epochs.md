---
id: TASK-143.01.05
title: Persist Archboard app-server epochs
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.04
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-epoch
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the atomic epoch manifest outside Codex rollout and SQLite storage in `src/runtime/codex-epoch`. This module records only Archboard child and linked-thread provenance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening a replacement child creates a new epoch while preserving prior records for inspection; corrupt or missing manifests produce explicit recoverable states.
- [ ] #2 The module records every Archboard-created or explicitly linked workhorse and coordinator with the child epoch and never writes into Codex rollout or SQLite files.
- [ ] #3 Module tests prove atomic persistence, replacement invalidation, and that prior-epoch records can be read but cannot yield an executable ownership proof.
<!-- AC:END -->
