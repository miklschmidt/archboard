---
id: TASK-143.06.02
title: Deliver semantic context through an exact thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.06.01
references:
  - docs/adr/0005-bystander-injection.md
modified_files:
  - src/runtime/codex-thread-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own linked workhorse context delivery in `src/runtime/codex-thread-context`. It subscribes to the semantic publisher and uses only a current executable thread link on the owned session; coordinator realtime fan-out is consumed separately by coordinator callbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A significant board event is injected quietly and once into the exact linked controllable workhorse without starting a turn or selecting a recent thread.
- [ ] #2 Unbound, unavailable, ownership-unknown, prior-epoch, lease-loss, or child-exit state produces no delivery and an inspectable reason; replacement children never inherit routing proof.
- [ ] #3 Process tests prove exact routing, no polling, no self-injection, same-child reconnect, and isolation between two dedicated sessions.
<!-- AC:END -->
