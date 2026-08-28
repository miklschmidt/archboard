---
id: TASK-130.03
title: Convert small module checks to typed contract tests
status: To Do
assignee: []
created_date: '2026-08-28 01:03'
labels: []
dependencies:
  - TASK-130.01
references:
  - scripts/check-library.mjs
  - scripts/check-text-metrics.mjs
  - scripts/check-obsidian-md.mjs
  - scripts/check-change-reporting.mjs
  - docs/design/measuring-text-outside-a-browser.md
  - docs/design/server-is-the-truth.md
parent_task_id: TASK-130
priority: medium
type: task
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the focused library, text measurement, Obsidian Markdown, and change-reporting checks into the modules whose public contracts they exercise. These are the lowest-risk proving ground for typed fixtures, named bun:test assertions, and the 500-line test limit.

The conversion must delete local failure counters and process exits. Tests should fail at the specific contract instead of printing one aggregate summary after hundreds of statements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-library, check-text-metrics, check-obsidian-md, and check-change-reporting are replaced by co-located typed Bun tests that import only module-root entrypoints.
- [ ] #2 Text metrics retain their measured tolerances and fixtures; Obsidian Markdown retains the four historical ID rename golden values and exact serialized bytes.
- [ ] #3 Change-reporting tests preserve source tagging, human-edit ordering, held/released behavior, and every currently asserted reachable state.
- [ ] #4 Each test file is at most 500 lines, test names identify one observable contract, and shared setup reduces duplicated mechanics without hiding expected values.
- [ ] #5 The old scripts fail when run against an intentionally broken focused fixture before deletion, and the replacement native tests fail on the same behavior.
- [ ] #6 The focused native lane plus bun run type-check, bun run lint, and bun run fmt:check pass after the legacy scripts are removed.
<!-- AC:END -->
