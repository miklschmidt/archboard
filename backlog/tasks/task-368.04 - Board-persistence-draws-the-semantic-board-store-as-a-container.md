---
id: TASK-368.04
title: Board persistence draws the semantic board store as a container
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - architecture
dependencies:
  - TASK-368.02
  - TASK-368.03
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: docs
ordinal: 640000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Board persistence is the measured example: Archboard server calls eight of the store's private files, two parts of the engine module look like the rest, and nothing says where the store ends. It is the first board the new rule redraws, through a proposal adopted by this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A proposal on Board persistence draws the store as a container, with the engine parts outside it, and is adopted
- [ ] #2 `semantic inspect` on the container reports the entry points that the code's `index.ts` exposes and callers use, or the task notes explain each difference
- [ ] #3 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->
