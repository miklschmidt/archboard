---
id: TASK-369.07
title: The pane inspector shows a part's recent changes and the parts it changes with
status: To Do
assignee: []
created_date: '2026-09-29 01:19'
labels:
  - history
  - ui
dependencies:
  - TASK-369.03
  - TASK-369.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: low
type: feature
ordinal: 655000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The history lens reaches an agent through the CLI. A user reading a board sees it only if the inspector shows it. The picture has no free visual channel (ADR 0025), and traffic must not show churn (ADR 0027), so the sidebar is the place.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting a part shows its recent commits and the parts it changes together with, each with a count
- [ ] #2 Selecting a coupled part from that list selects it on the canvas
- [ ] #3 Nothing is stored, and the canvas picture does not change
<!-- AC:END -->
