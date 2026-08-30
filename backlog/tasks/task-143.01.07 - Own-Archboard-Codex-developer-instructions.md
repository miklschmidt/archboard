---
id: TASK-143.01.07
title: Own Archboard Codex developer instructions
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:39'
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
Own tracked UTF-8 instruction documents, their byte hashes, deterministic composition, and the closed `additionalContext` schema in `src/runtime/codex-instructions`. Callers select a reviewed role and supply typed Archboard context; they cannot append authored text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One tracked workhorse document and one tracked coordinator document are read byte-for-byte; coordinator starts concatenate workhorse bytes, exactly one LF-delimited separator, and coordinator bytes with stable hashes.
- [ ] #2 The additionalContext schema contains only pane, board, thread-link, current child/epoch, workhorse/coordinator role, semantic brief, focus/selection freshness, ambiguity, and operation correlation; unknown fields or caller-authored prose are rejected.
- [ ] #3 Attached-thread turns receive only encoded additionalContext; attach, reconnect, rejoin, and fork never rewrite persisted developer instructions, configuration, or dynamic tools.
- [ ] #4 Byte fixtures in src/runtime/codex-instructions/tests make BOM, newline, whitespace, separator, hash, schema, and accidental additions observable.
<!-- AC:END -->
