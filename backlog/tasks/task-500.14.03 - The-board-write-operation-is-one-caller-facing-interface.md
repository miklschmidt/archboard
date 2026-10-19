---
id: TASK-500.14.03
title: The board write operation is one caller-facing interface
status: Done
assignee: []
created_date: '2026-10-19 09:18'
updated_date: '2026-10-19 22:26'
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
- [x] #1 One public store-write interface defines the operations callers need, with its helpers and transition tables private, and every caller uses it
- [x] #2 The evaluation harness still has its pure preparation operation
- [x] #3 The write boundary persistence tests pass with unchanged assertions, and bun run check passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Callers reach the board write through one public file, @archboard/board/store-write (writeSemanticBoard, the transition builders, acceptedBoard, discardSemanticBoard, renameTransition); its helpers and tables are private, and skills laying.ts still uses the pure transition builders for the evaluation harness. I did not redesign it into a single declared-operation function: no caller or failure asked for one, so it fails the real-need gate. The write-boundary tests are unchanged and bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
