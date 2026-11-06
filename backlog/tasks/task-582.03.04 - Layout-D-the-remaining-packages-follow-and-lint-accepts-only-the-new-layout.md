---
id: TASK-582.03.04
title: 'Layout D: the remaining packages follow, and lint accepts only the new layout'
status: To Do
assignee: []
created_date: '2026-11-06T19:07:00Z'
labels: []
dependencies:
  - TASK-582.03.03
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1032000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages without a containment warning still sit role first, and the ratchet and the dual-form lint exist only for the move. Plan: doc-003, step D.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every tracked source and test file under an area has exactly one role folder, and it is the last folder of its path
- [ ] #2 The ratchet constant and the old-form lint paths are gone, and the lint rules accept only the new layout
- [ ] #3 bun run check passes
<!-- AC:END -->
