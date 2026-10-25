---
id: TASK-537.03
title: A chosen design question lights its answer on the board on screen
status: To Do
assignee: []
created_date: '2026-10-25T17:04:00Z'
labels:
  - design-questions
  - ui
dependencies:
  - TASK-537.01
  - TASK-537.02
parent_task_id: TASK-537
type: feature
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0057 (TASK-537.02) lets a chosen design question light its answer. Without the light, a person reads a list of names and still has to find each part on the picture. The Overview draws every container closed (ADR 0052), so many answers sit inside a container that the view does not open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Choosing a question leaves its subjects and the containers that hold them lit, and recedes the rest. Nothing is written
- [ ] #2 A subject that the view does not draw is lit through the nearest drawn container, and the region says how many subjects the view hides
- [ ] #3 A pick shows its own Light, and letting go of the pick brings the light of the chosen question back
- [ ] #4 Choosing a group or a walkthrough step lets the question go, and choosing a question lets the pick and the group go
<!-- AC:END -->
