---
id: TASK-663.06
title: The records and the skill teach kinds, effects and lenses
status: To Do
assignee: []
created_date: '2026-11-22T03:39:00Z'
labels: []
dependencies: []
parent_task_id: TASK-663
ordinal: 1150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two ADRs (the vocabulary with effect; the reading contract with lenses), Effect beside Relationship kind and Lens under Reading in CONTEXT.md, the classification rule taught once in the archboard skill's Map the code, and amendments to ADRs 0024, 0025, 0046, 0057, 0065, 0066 and 0070. The classification rule, in order: can the operation have a side effect (including a conditional write, a publication, an acknowledgement that removes work, installing a subscription; follow delegated work)? mutation. Otherwise does it read held or fetched state? query. Otherwise compute. Doubt about a side effect is a mutation. A relationship covering several operations takes the strongest. Every kind is judged by its operation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two ADRs record the vocabulary and the reading contract, and the amended ADRs link them
- [ ] #2 CONTEXT.md defines Effect and Lens, and Relationship kind names how it travels
- [ ] #3 The archboard skill teaches the built-in kinds, the effect rule and repository-specific kinds once
<!-- AC:END -->
