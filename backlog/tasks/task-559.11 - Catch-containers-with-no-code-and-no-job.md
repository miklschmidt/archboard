---
id: TASK-559.11
title: Catch containers with no code and no job
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
labels:
  - cli
  - skills
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 983000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided that the consumer skill and archboard check must catch containers with no code and no job of their own, so that numbered layers do not return.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check` warns on a pass-through container and on a root with no relationship
- [ ] #2 The warning names the module and what the author can do next, and no write is refused
- [ ] #3 The consumer skill teaches the same rule
- [ ] #4 This repository passes with no such warning, or each remaining warning carries a stated job
<!-- AC:END -->
