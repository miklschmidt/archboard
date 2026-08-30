---
id: TASK-143.06.02
title: Deliver semantic context through an exact thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
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
Own linked workhorse semantic delivery in `src/runtime/codex-thread-context`. It subscribes to `SemanticContextEvent`, resolves one executable thread link, and issues an at-most-one quiet dispatch through the stable session port; coordinator fan-out is separate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each significant board event is correlated and dispatched at most once through thread/inject_items to the exact current linked controllable workhorse without starting a turn or selecting a recent thread.
- [ ] #2 Because 0.151.0 inject_items has no idempotency key, a settled attempt ends as delivered, not_delivered, or outcome_unknown; transport loss never retries outcome_unknown blindly.
- [ ] #3 Unbound, unavailable, ownership-unknown, prior-epoch, lease-loss, ambiguity beyond policy, or child-exit state produces no dispatch and an inspectable refusal; replacement children inherit no routing proof.
- [ ] #4 Process tests in src/runtime/codex-thread-context/tests prove exact routing, at-most-one dispatch, lost-response outcome, no polling/self-delivery, same-child reconnect, and two-session isolation.
<!-- AC:END -->
