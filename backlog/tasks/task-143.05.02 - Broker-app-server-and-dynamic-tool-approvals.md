---
id: TASK-143.05.02
title: Broker app-server and dynamic-tool approvals
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 12:38'
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

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A closed discriminated union covers command execution, file change, tool requestUserInput, MCP elicitation/openai form/URL, permissions, legacy applyPatchApproval, and legacy execCommandApproval using each real request/thread-or-conversation/turn-or-null/item/call/server/approval identity.
- [ ] #2 The broker owns staged, pending, settled, expired, cancelled, stale, and outcome_unknown CAS state and revalidates child/epoch/link/target/effect immediately before one terminal response.
- [ ] #3 Only this module constructs the seven human-interaction response variants; TASK-143.05.04 and TASK-143.07.06 alone construct their dynamic-tool responses, and TASK-143.01.06 alone writes supplied responses to the wire.
- [ ] #4 Binary spoken eligibility excludes secrets, multi-question/forms/URLs, permission scopes, coordinator-blocking requests, unsupported schemas, stale ownership, and any broader grant; all remain visual.
- [ ] #5 Tests cover accept/decline/cancel/validation, expiry, simultaneous requests, stale browser lease, effect change, child exit, late result, lost write, and exactly-once settlement for every family.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the completed protocol, transport, identity, timing, session, browser-model, and UI contracts plus existing approval seams, then define the closed request-family union and typed fake-port fixtures without changing those owners.
2. Implement one src/runtime/codex-approvals mediator that stages, CAS-transitions, validates, expires, cancels, and settles every required approval family, revalidating child/epoch/link/target/effect immediately before constructing exactly one terminal response.
3. Keep session-owned currentTime/token-refresh/attestation and dispatcher-owned dynamic-tool responses at their existing boundaries; make the mediator the only constructor for the seven approval response variants and retain dynamic tool responses in their dispatchers.
4. Add focused fake-port tests for each family and accept/decline/cancel/expiry/stale/effect-change/child-exit/late-write/exactly-once paths, including binary spoken eligibility exclusions.
5. Run sequential named systemd validation services with MemoryMax=6G and MemorySwapMax=1G, record evidence and risks, then commit the coherent scoped change for independent review without finalizing the task.
<!-- SECTION:PLAN:END -->
