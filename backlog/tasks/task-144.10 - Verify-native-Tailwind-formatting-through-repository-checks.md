---
id: TASK-144.10
title: Verify native Tailwind formatting through repository checks
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
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
Own the repository-policy fixture for native Oxfmt Tailwind sorting at `tests/system/repository-policy/oxfmt-tailwind.test.ts`. It tests the configured formatter through package scripts and introduces no formatter or lint policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A deliberately misordered className and approved cn helper fixture fails fmt:check, is normalized by the installed Oxfmt package, and passes on the second check.
- [ ] #2 The fixture proves the canonical Tailwind 4 stylesheet and helper-function list are used while native duplicate and whitespace defaults remain unchanged.
- [ ] #3 Repository and full checks run this owner and no custom Tailwind order, second formatter, plugin, warning allowance, or lint bypass is introduced.
<!-- AC:END -->
