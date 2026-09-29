---
id: TASK-368.07
title: Compare the interfaces of competing proposals side by side
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - cli
  - skill
dependencies:
  - TASK-368.06
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 643000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Design it twice (Ousterhout): the first interface is rarely the best, so a designer drafts two or more and compares them. Archboard already branches competing drafts from one base and shelves the losers with a reason (ADR 0030). What is missing is one answer that puts their interfaces side by side.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One command reports each container's interface measures for two or more variants in one answer
- [ ] #2 The propose recipe of the consumer skill describes design it twice: branch two or more drafts under different constraints, compare the measures and the pictures, adopt or keep one, and shelve the rest with the reason
<!-- AC:END -->
