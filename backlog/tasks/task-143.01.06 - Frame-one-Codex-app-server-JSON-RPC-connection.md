---
id: TASK-143.01.06
title: Frame one Codex app-server JSON-RPC connection
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 18:07'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.03
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-transport
  - src/runtime/codex-transport/tests/transport.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own newline-delimited JSON-RPC framing, request/reverse-request correlation, cancellation settlement, late-result retention, and wire shutdown for one child epoch. It performs no semantic retry and constructs no tool result.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Client requests, responses, notifications, errors, and reverse requests correlate by child, epoch, and requestId; logical dynamic calls retain child, epoch, threadId, turnId, callId, namespace, tool, and manifestHash.
- [ ] #2 A local timeout or cancellation settles only the local waiter and never claims remote cancellation; late responses remain inspectable and non-idempotent lost responses classify as outcome_unknown.
- [ ] #3 Only newline-delimited stdout frames enter the decoder, stderr drains independently, malformed/duplicate/unknown frames fail the owning operation without corrupting later frames, and backpressure is bounded.
- [ ] #4 codex-approvals owns seven human responses, the two dynamic dispatchers own item/tool/call responses, and codex-session owns currentTime plus unsupported refresh/attestation responses. Transport validates correlation and writes each supplied response at most once.
- [ ] #5 src/runtime/codex-transport/tests/transport.test.ts exhausts framing, every message direction, correlation, cancellation, late/duplicate/malformed frames, bounded backpressure, response ownership, one-write settlement, and shutdown against fake child streams.
<!-- AC:END -->
