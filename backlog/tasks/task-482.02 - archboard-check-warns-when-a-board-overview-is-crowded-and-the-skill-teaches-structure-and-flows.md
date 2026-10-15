---
id: TASK-482.02
title: >-
  archboard check warns when a board overview is crowded, and the skill teaches
  structure and flows
status: To Do
assignee: []
created_date: '2026-10-15 21:05'
labels:
  - semantic-model
  - skill
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
type: feature
ordinal: 843000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Flat boards and calls drawn as relationships made the dogfood drawings unreadable (ADR 0052). Kinds are vault vocabulary, so no check can tell a call from a relationship. A budget on the overview catches both problems.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check` warns `OVERVIEW_CROWDED` when the overview of a board current variant draws more than 15 parts or more than 25 lines, and names both counts and the fix
- [ ] #2 The budget numbers are constants in one place, beside what they hold against
- [ ] #3 The archboard skill teaches agents to gather the parts of a subject into a few containers with views that open each one, and to put calls in flows with one relationship per pair of parts
<!-- AC:END -->
