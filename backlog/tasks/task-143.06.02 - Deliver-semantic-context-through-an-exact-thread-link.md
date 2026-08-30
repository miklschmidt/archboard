---
id: TASK-143.06.02
title: Deliver semantic context through an exact thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.06.01
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-thread-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver settled semantic context to the exact executable workhorse link through the typed session and expose delivery outcomes. It performs one guarded inject_items attempt and owns no target selector.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Immediately before delivery, the module revalidates child, epoch, pane link, loaded membership, controllability, thread status, semantic cursor, and origin; agent-only/cosmetic or stale events do not send.
- [ ] #2 The payload is exactly one developer message with one input_text part using the canonical context encoding; it starts no turn and targets no coordinator or recent thread.
- [ ] #3 Each event is attempted at most once and settles delivered, not_delivered with reason, or outcome_unknown on lost response; there is no fallback steer, retry, or alternate thread.
- [ ] #4 Tests cover unbound/notLoaded/uncontrollable/systemError/prior-epoch/child-exit, link change during delivery, duplicate event, stale cursor, lost response, and inspectable outcome.
<!-- AC:END -->
