---
id: TASK-143.05.02
title: Broker app-server and dynamic-tool approvals
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
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
Own browser approval leases, immutable request records, effect fingerprints, target revalidation, and exact-once decisions in `src/runtime/codex-approvals`. This module does not render cards or execute effects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Records use the shared discriminated approval identity without manufacturing missing turn IDs and bind child epoch, requester, target state token, canonical effect hash, offered decisions, and expiry.
- [ ] #2 Immediately before dispatch the broker re-reads target/effect state; change, owner loss, server resolution, fabricated choice, stale identity, or expiry invalidates the record and dispatches no effect.
- [ ] #3 Valid accept or decline settles exactly once; owner loss emits the generated terminal response for every pending reverse request before lease transfer.
- [ ] #4 Tests cover every generated approval/elicitation family, legacy identities, null MCP turn, transfer, cancellation before/after dispatch, stale races, and duplicate decisions.
<!-- AC:END -->
