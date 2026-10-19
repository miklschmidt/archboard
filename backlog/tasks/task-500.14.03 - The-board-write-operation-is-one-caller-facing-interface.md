---
id: TASK-500.14.03
title: The board write operation is one caller-facing interface
status: To Do
assignee: []
created_date: '2026-10-19 09:18'
labels: []
dependencies:
  - TASK-500.14.02
parent_task_id: TASK-500.14
ordinal: 882000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
write, transitions, accepted, discard, rename and propagate are one capability: callers provide a declared operation, and the module owns transition selection, validation, propagation and persistence. Today callers import each file. The Codex advice (TASK-500.12 review): store-write owns that capability, and a pure preparation operation stays available for the evaluation harness. Read the callers first and design the interface from what they do. This is real interface design, so the plan goes through Codex before code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One public store-write interface defines the operations callers need, with its helpers and transition tables private, and every caller uses it
- [ ] #2 The evaluation harness still has its pure preparation operation
- [ ] #3 The write boundary persistence tests pass with unchanged assertions, and bun run check passes
<!-- AC:END -->
