---
id: TASK-369.03
title: An agent can list the hotspots of a board
status: To Do
assignee: []
created_date: '2026-09-29 01:19'
labels:
  - history
  - cli
  - skill
dependencies:
  - TASK-369.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: feature
ordinal: 651000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A hotspot is a part that changes often. The improve-codebase-architecture skill starts by walking `git log` for hot spots, and a board can give the answer per part instead of per file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a board, the answer ranks its parts by the number of commits that changed their bound files in a window, with a default and an option
- [ ] #2 Commits over the size filter are left out, and the answer says how many
- [ ] #3 The read recipe of the consumer skill says when to use it
<!-- AC:END -->
