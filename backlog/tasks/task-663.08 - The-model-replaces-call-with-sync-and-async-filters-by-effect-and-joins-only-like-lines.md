---
id: TASK-663.08
title: >-
  The model replaces call with sync and async, filters by effect, and joins only
  like lines
status: To Do
assignee: []
created_date: '2026-11-22T14:11:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
88% of relationships were the catch-all call, so pictures were one gray mass and the goal of retiring call was missed. The owner settled sync and async as the in-process kinds, effect switches beside kind switches, one-click lenses, and no mixed-kind lines (artifacts/t663-legend/spec.md sections 1, 3, 4, 6 and settled.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The built-in kinds are sync, async, http, rpc, event, queue, stream, spawn, render, storage and dependency, with the colors of the spec, and no kind sets the arrowhead
- [ ] #2 A relationship, lens selector, --hide-kind or relationshipKinds entry naming call is refused with sync and async named
- [ ] #3 Lenses are main, effects (Side effects), sync-compute (Sync compute), network, reads, dependencies and all, in that order
- [ ] #4 hideEffects with tokens mutation, query, compute and declared filters after the lens, and the address, recipe and CLI --hide-effect carry it
- [ ] #5 Relationships join into one line only when they share kind and effect
- [ ] #6 An old address or recipe with hideKinds=call reads as sync and async
- [ ] #7 The upgrade inventory seeds sync or async from code facts and leaves the rest blank
<!-- AC:END -->
