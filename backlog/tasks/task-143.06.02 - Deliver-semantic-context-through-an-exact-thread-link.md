---
id: TASK-143.06.02
title: Deliver semantic context through an exact thread link
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 15:11'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.06.01
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a public exact-thread semantic delivery port with immutable event records, deterministic refusal reasons, and no target selector.
2. Compose the existing semantic publisher, thread-link/epoch authorities, owned child lifecycle, session threadInjectItems method, and canonical codex-instructions injection builder at one guarded delivery boundary.
3. Revalidate all current child/epoch, pane/link/provenance, loaded/controllable/status, semantic cursor/origin, and event-identity conditions immediately before the single write; settle each event once as delivered, not_delivered, or outcome_unknown.
4. Add focused fake-port race tests for every requested refusal, duplicate/stale event, link/child changes during delivery, and lost responses; run only scoped type, lint, format, and module tests.
<!-- SECTION:PLAN:END -->
