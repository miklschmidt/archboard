---
id: TASK-144.06
title: Enable native Oxfmt Tailwind class sorting
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.02
  - TASK-144.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - .oxfmtrc.jsonc
parent_task_id: TASK-144
priority: high
type: task
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own `.oxfmtrc.jsonc` and its formatter fixtures. Use Oxfmt's built-in Tailwind 4 sorter rather than a formatter plugin or custom class-order rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The native option points at the canonical v4 stylesheet, lists only helper function names actually used, retains native duplicate/whitespace defaults, and corrects the existing `lineWidth` spelling to native `printWidth` at 100.
- [ ] #2 Misordered `className` and approved helper-call fixtures fail `bun run fmt:check` before native formatting and pass afterward.
- [ ] #3 No second formatter, Tailwind linter, custom Oxlint rule, or repository-owned copy of upstream class ordering/defaults is introduced.
<!-- AC:END -->
