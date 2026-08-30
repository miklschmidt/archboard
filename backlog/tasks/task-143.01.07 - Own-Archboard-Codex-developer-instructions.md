---
id: TASK-143.01.07
title: Own Archboard Codex developer instructions
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies: []
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-instructions
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the exact authored instruction inputs and deterministic composition policy in `src/runtime/codex-instructions`. This module returns bytes for new workhorse and coordinator starts and additional context for attached turns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 General thread starts use one tracked UTF-8 workhorse instruction document; coordinator starts append one tracked coordinator document with one tested separator and no other authored text.
- [ ] #2 Attached-thread turns receive the exact Archboard application context through `additionalContext`; attach, reconnect, rejoin, and fork never rewrite persisted developer instructions or configuration.
- [ ] #3 Byte fixtures and public-module tests make whitespace, separator, and accidental caller-authored additions observable.
<!-- AC:END -->
