---
id: TASK-328.03
title: Refresh Semantic renderer and Renderer layout
status: To Do
assignee: []
created_date: '2026-09-24 09:24'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 566000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer after ADR 0033 (Graphviz placement, libavoid routing, column folds). TASK-327 redrew Renderer layout's current variant; Semantic renderer still says reading choice, flank rules, scorecard and ELK in Compound layout's description, an edge label and a beat, and the ELK worker pool in a node description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [ ] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [ ] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->
