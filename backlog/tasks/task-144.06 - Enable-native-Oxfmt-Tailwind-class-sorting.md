---
id: TASK-144.06
title: Enable native Oxfmt Tailwind class sorting
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:45'
labels: []
dependencies:
  - TASK-144.03
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
- [ ] #1 Oxfmt native Tailwind sorting points to src/ui/theme/app.css, sets attributes to [className] and functions to [cn], retains native duplicate/whitespace defaults, and corrects lineWidth to native printWidth 100.
- [ ] #2 The installed repository Oxfmt package formats supported source through existing scripts; behavior verification belongs to exact repository owner TASK-144.10.
- [ ] #3 No second formatter, Tailwind linter, custom Oxlint rule, repository copy of class ordering/defaults, warning allowance, or disabled check is introduced.
<!-- AC:END -->
