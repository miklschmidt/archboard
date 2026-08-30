---
id: TASK-144.06
title: Enable native Oxfmt Tailwind class sorting
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:58'
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
Enable Oxfmt's native Tailwind v4 sorting using the canonical stylesheet and helper function. Keep className native; add no custom sorting rules or copied defaults.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Oxfmt configuration names the canonical stylesheet and functions [cn]; className uses native formatter behavior and is not redundantly configured.
- [ ] #2 Sorting follows installed Oxfmt/Tailwind v4 semantics for static strings and cn calls without formatting dynamic expressions, templates, or data as invented classes.
- [ ] #3 No Prettier plugin, custom comparator, Tailwind-specific Oxlint rule, warning allowance, or upstream default mirror is added.
- [ ] #4 TASK-144.10 owns the fail-format-pass repository fixture; this task owns configuration only.
<!-- AC:END -->
