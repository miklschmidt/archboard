---
id: TASK-143.05.02
title: Broker app-server and dynamic-tool approvals
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.06
  - TASK-143.01.08
  - TASK-143.05.01
  - TASK-143.01.16
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
Own compare-and-swap lifecycle, identity/effect validation, expiry, cancellation, and terminal response construction for all app-server human-interaction families. Dynamic dispatchers never construct approval responses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A closed discriminated union covers command execution, file change, tool requestUserInput, MCP elicitation/openai form/URL, permissions, legacy applyPatchApproval, and legacy execCommandApproval using each real request/thread-or-conversation/turn-or-null/item/call/server/approval identity.
- [ ] #2 The broker owns staged, pending, settled, expired, cancelled, stale, and outcome_unknown CAS state and revalidates child/epoch/link/target/effect immediately before one terminal response.
- [ ] #3 Only this module constructs the seven human-interaction response variants; TASK-143.05.04 and TASK-143.07.06 alone construct their dynamic-tool responses, and TASK-143.01.06 alone writes supplied responses to the wire.
- [ ] #4 Binary spoken eligibility excludes secrets, multi-question/forms/URLs, permission scopes, coordinator-blocking requests, unsupported schemas, stale ownership, and any broader grant; all remain visual.
- [ ] #5 Tests cover accept/decline/cancel/validation, expiry, simultaneous requests, stale browser lease, effect change, child exit, late result, lost write, and exactly-once settlement for every family.
<!-- AC:END -->
