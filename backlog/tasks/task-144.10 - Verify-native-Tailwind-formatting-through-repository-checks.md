---
id: TASK-144.10
title: Verify native Tailwind formatting through repository checks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 00:46'
labels: []
dependencies:
  - TASK-144.06
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - tests/system/repository-policy/oxfmt-tailwind.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own a disposable repository-format fixture that proves native Tailwind sorting through the actual bun run fmt/fmt:check commands and leaves the checkout clean.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A generated fixture begins deliberately unsorted, makes bun run fmt:check fail for the expected file/reason, runs bun run fmt, then makes fmt:check pass with the installed native Tailwind v4 order.
- [ ] #2 The fixture covers className and cn, preserves dynamic expressions, and runs without modifying authored production files or relying on a hand-coded expected sorter.
- [ ] #3 Cleanup is unconditional and a final git diff/status assertion proves no tracked or reproducible derived artifact remains.
- [ ] #4 A missing stylesheet/helper configuration or future Oxfmt behavior drift fails actionably; no warning suppression is accepted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the exact bun run fmt and fmt:check scripts, Oxfmt 0.65.0 fixture conventions, the finalized Tailwind sorting configuration, and repository cleanup owners.

2. Add one disposable repository-policy owner that creates a deliberately unsorted isolated fixture, proves the real fmt:check fails actionably, runs the real fmt command, and proves the real fmt:check then passes with native className and cn ordering while dynamic expressions remain unchanged.

3. Make cleanup unconditional across success, failure, signal, and assertion paths; prove the authored checkout and reproducible artifacts remain unchanged, then run focused, repository, module, type, lint, format, and frontend gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.06 finalized at integration HEAD e9fd214. This leaf owns tests/system/repository-policy/oxfmt-tailwind.test.ts and its task record only; it must exercise the actual package scripts and must not hand-code a Tailwind sorter or modify authored production/configuration files.
<!-- SECTION:NOTES:END -->
