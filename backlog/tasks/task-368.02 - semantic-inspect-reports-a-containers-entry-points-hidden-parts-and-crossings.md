---
id: TASK-368.02
title: >-
  semantic inspect reports a container's entry points, hidden parts and
  crossings
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - cli
  - semantic-model
dependencies:
  - TASK-368.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: high
type: feature
ordinal: 638000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of the interface lens: one derivation, one command, any board. `inspectGroup` (`src/shared/semantic-board/lib/groups.ts`) already derives a group's boundary in the same way, so the derivation lives beside it in the shared model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a named container on any variant, the answer lists its entry points, hidden parts, the outside parts that call it, the relationships that leave it and the entry points that only pass a call through
- [ ] #2 The derivation is a pure function of the variant's content, and nothing is stored
- [ ] #3 The machine-readable answer has a schema, and the read recipe of the consumer skill says when to use it
- [ ] #4 Tests own the derivation for nesting, relationships to the container itself, and a container with no outside caller
<!-- AC:END -->
