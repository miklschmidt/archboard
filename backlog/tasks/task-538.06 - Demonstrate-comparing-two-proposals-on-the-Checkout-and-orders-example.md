---
id: TASK-538.06
title: Demonstrate comparing two proposals on the Checkout and orders example
status: To Do
assignee: []
created_date: '2026-10-25T17:06:00Z'
labels:
  - compare
dependencies:
  - TASK-538.01
  - TASK-538.02
  - TASK-538.03
  - TASK-538.04
  - TASK-538.05
parent_task_id: TASK-538
type: task
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-538 is done when a person can do the whole comparison in the product. The Checkout and orders example of `scripts/readme-assets/evidence-fixture.ts` already has two competing proposals, so the demonstration needs no new proposal on the dogfood vault.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On the Checkout and orders example, a person opens one proposal beside the other variant from the About page, reads the interface changes first, picks Orders in both panes, and reads the measures side by side
- [ ] #2 Asked in the dock to design it a second way with the same behaviour, the agent branches a draft through the CLI
- [ ] #3 A rejected draft is shelved by the agent with the person's reason, and the vault shows only CLI writes with doing lines
- [ ] #4 The notes record the steps and what the person saw
<!-- AC:END -->
