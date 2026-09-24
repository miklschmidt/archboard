---
id: TASK-328.01
title: 'Refresh Archboard, Command interface and Command dispatch'
status: To Do
assignee: []
created_date: '2026-09-24 09:24'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 564000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
System board and the CLI. The CLI gained commands since 2026-09-17 (semantic record, rename, and others): read src/cli. The record command's pipeline itself is drawn on Board rasterizer (TASK-328.02); the Command interface board links there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [ ] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [ ] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->
