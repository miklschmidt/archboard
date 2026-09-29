---
id: TASK-368.09
title: The pane inspector shows the interface of a selected container
status: To Do
assignee: []
created_date: '2026-09-29 01:18'
labels:
  - interfaces
  - ui
dependencies:
  - TASK-368.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: feature
ordinal: 645000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The derived interface reaches an agent through the CLI. A user reading a board sees it only if the inspector shows it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting a container shows its entry points, the count of its hidden parts and its callers in the pane sidebar
- [ ] #2 Selecting an entry point from that list selects the part on the canvas
- [ ] #3 Nothing is stored, and the sidebar reads the same derivation as the CLI
<!-- AC:END -->
