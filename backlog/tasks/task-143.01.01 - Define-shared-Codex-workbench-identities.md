---
id: TASK-143.01.01
title: Define shared Codex workbench identities
status: To Do
assignee: []
created_date: '2026-08-30 15:06'
updated_date: '2026-08-30 16:25'
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
Own opaque branded identities and closed correlation records shared by the runtime and browser contracts. No module may substitute a string across identity domains or infer identity from recency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Distinct opaque types exist for ChildId, ChildEpoch, BrowserCommandId, ThreadId, TurnId, ItemId, QueuedSubmissionId, LoginId, JSON-RPC request id, DynamicToolCallId, RealtimeSessionId, and ApprovalId.
- [ ] #2 A wire-request correlation is exactly child, epoch, requestId; a logical tool-call correlation is exactly child, epoch, threadId, turnId, callId, namespace, tool, and manifestHash.
- [ ] #3 Parsers validate wire strings once, preserve opacity across DTOs, and reject empty, wrong-domain, stale-epoch, or caller-fabricated identities.
- [ ] #4 Type fixtures prove that thread/turn/item/queue/login/request identities cannot be interchanged and runtime fixtures prove stable round trips.
<!-- AC:END -->
