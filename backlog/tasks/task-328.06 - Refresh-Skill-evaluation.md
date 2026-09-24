---
id: TASK-328.06
title: Refresh Skill evaluation
status: To Do
assignee: []
created_date: '2026-09-24 09:24'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 569000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The skill evaluation harness under its current code. Never run bun run eval:skill run or grade, and never walk .skill-evals recursively; read the harness source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [ ] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [ ] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->
