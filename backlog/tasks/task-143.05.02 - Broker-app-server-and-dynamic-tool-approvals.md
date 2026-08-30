---
id: TASK-143.05.02
title: Broker app-server and dynamic-tool approvals
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.08
  - TASK-143.01.10
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-approvals
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own immutable approval records, generated response construction, effect fingerprints, target revalidation, and compare-and-swap settlement in `src/runtime/codex-approvals`. Browser lease remains in the gateway; cards and spoken gate hold only broker identity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A generated-variant table covers every 0.151.0 command/file approval, tool user-input, MCP elicitation, permissions request, legacy approval, and dynamic-tool effect identity, including request correlation, null-turn variants, legal decisions, and exact terminal responses.
- [ ] #2 Records bind child/epoch, requester identity, target state token, canonical effect hash, offered decisions, expiry, and cancellation state without manufacturing missing thread/turn IDs.
- [ ] #3 The broker CAS re-reads target/effect state immediately before dispatch; changed state, owner loss, server resolution, cancellation, fabricated choice, stale identity, expiry, or duplicate produces one typed terminal outcome and no second effect.
- [ ] #4 Owner loss accepts a request identity from the gateway and constructs the generated terminal response; tests in src/runtime/codex-approvals/tests cover every table cell, transfer, cancellation before/after dispatch, stale races, and duplicate visual/spoken decisions.
<!-- AC:END -->
