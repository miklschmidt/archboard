---
id: TASK-496
title: >-
  An agent reads in text what a view draws at a variant, and which views draw
  anything there
status: To Do
assignee: []
created_date: '2026-10-18 13:15'
labels:
  - cli
  - skill
dependencies: []
priority: high
type: enhancement
ordinal: 861000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents that explain a pull request choose a view by rendering it, rasterizing it and reading the picture, because no command says what a view draws at a variant. Every view belongs to every variant, and a board can hold many: in the Docs-Architecture-Design vault, Device Trust Control Plane has 46 views and Platform Test Cluster 43, and many draw little or nothing at a given draft. One agent on the device trust stack tried seven trial views for one pull request, and another rendered view after view to find which drew a concern at a design draft. Each render costs image tokens and time, and a picture misleads: a key read "Changed 1" with no mark the agent could find. A text answer lets an agent pick a view from one read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One command answers, for one view at one variant, which cards, relationships, flows and steps it draws, with the size of the picture
- [ ] #2 Given a variant to read against, the same answer marks each drawn subject as added, changed or removed, as the picture would
- [ ] #3 One command lists every view of a board with what it draws at a variant, so that a view that draws nothing there is visible without a render
- [ ] #4 The archboard and archboard-pr skills choose a view from this answer before they render
<!-- AC:END -->
