---
id: TASK-235.07
title: Warn when a write removes and re-adds an equivalent relationship
status: To Do
assignee: []
created_date: '2026-09-15 18:51'
labels: []
dependencies: []
references:
  - src/runtime/semantic-board-store
  - TASK-235
parent_task_id: TASK-235
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to the guardrail: the product could tell an author at write time that a batch removed a relationship and added one with the same endpoints and kind, since the loud rules teach themselves and a guardrail only catches it in evaluation. Not started; needs a decision on whether this is a warning on the write answer or a refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A write whose batch removes a relationship and adds one with the same from, to and kind answers with a warning naming both ids
<!-- AC:END -->
