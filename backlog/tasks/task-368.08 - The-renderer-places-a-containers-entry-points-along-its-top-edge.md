---
id: TASK-368.08
title: The renderer places a container's entry points along its top edge
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - renderer
dependencies:
  - TASK-368.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 644000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board reads from the top down, and callers sit above what they call. When the reached children of a container sit on its top edge, a deep module looks deep: a narrow row of entry points over a larger hidden body. This is layout, which the renderer owns (ADR 0023), and no new visual channel (ADR 0025).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On the Track engine, a container's entry points take its first row, and its hidden parts sit below them
- [ ] #2 The readability measures of the scorecard do not get worse on the fixture boards and the dogfood boards, or the user accepts the pictures in a review
- [ ] #3 Every board still lays out under 1 second, and comparison and variant pictures keep working
<!-- AC:END -->
