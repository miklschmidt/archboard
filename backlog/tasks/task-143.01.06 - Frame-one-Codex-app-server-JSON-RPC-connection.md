---
id: TASK-143.01.06
title: Frame one Codex app-server JSON-RPC connection
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.04
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-transport
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own newline-delimited JSON framing and request correlation in `src/runtime/codex-transport`. It connects one process handle to decoded protocol messages without reducing thread semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The transport handles partial and coalesced frames, request IDs, notifications, reverse requests, one-shot responses, timeouts, cancellation, and clean close.
- [ ] #2 Malformed frames, late responses, double responses, unknown notifications, child exit, and writes after close settle deterministically with inspectable errors.
- [ ] #3 Two child transports with overlapping request IDs prove complete response, notification, approval, and shutdown isolation.
<!-- AC:END -->
