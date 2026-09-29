---
id: TASK-367.24
title: The canvas marks the parts and relationships that the code check warns about
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
  - ui
  - renderer
dependencies:
  - TASK-367.03
  - TASK-367.05
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 632000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Findings in a terminal reach an agent. A user reading a board sees nothing. Every visual channel is already taken (ADR 0025, ADR 0031), and the unsettled warning triangle is the nearest precedent for a derived mark. This task decides whether code findings share that mark or need another way, and keeps polling cheap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane shows that a part or relationship of the current variant has code findings, as a derived mark that is never stored
- [ ] #2 The inspector lists the findings for the selected subject
- [ ] #3 The pane reads cached findings and never starts a code pass itself
- [ ] #4 The mark passes a picture review, and every board still lays out under 1 second
<!-- AC:END -->
