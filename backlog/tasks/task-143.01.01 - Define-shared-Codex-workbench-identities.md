---
id: TASK-143.01.01
title: Define shared Codex workbench identities
status: To Do
assignee: []
created_date: '2026-08-30 15:06'
labels: []
dependencies: []
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/shared/codex-workbench-identity
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the shared identity vocabulary used across runtime, server, and UI so child instances, epochs, thread links, calls, correlations, and approvals cannot be confused. This leaf owns only `src/shared/codex-workbench-identity` and has no app-server behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opaque child, epoch, thread-link, request, call, correlation, and realtime-session identities serialize deterministically and cannot be interchanged by TypeScript.
- [ ] #2 Approval request identity is a discriminated union: V2 item requests use JSON-RPC request/thread/turn/item plus optional approvalId; MCP uses request/thread/nullable-turn/server plus URL elicitationId when present; legacy uses request/conversation/call plus optional approvalId. No variant invents a turn.
- [ ] #3 Focused module tests cover round trips, equality, malformed decoding, and compile-time misuse through the public module entrypoint.
<!-- AC:END -->
