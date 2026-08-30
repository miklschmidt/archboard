---
id: TASK-144.10
title: Verify native Tailwind formatting through repository checks
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:25'
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
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A generated fixture begins deliberately unsorted, makes bun run fmt:check fail for the expected file/reason, runs bun run fmt, then makes fmt:check pass with the installed native Tailwind v4 order.
- [ ] #2 The fixture covers className and cn, preserves dynamic expressions, and runs without modifying authored production files or relying on a hand-coded expected sorter.
- [ ] #3 Cleanup is unconditional and a final git diff/status assertion proves no tracked or reproducible derived artifact remains.
- [ ] #4 A missing stylesheet/helper configuration or future Oxfmt behavior drift fails actionably; no warning suppression is accepted.
<!-- AC:END -->
