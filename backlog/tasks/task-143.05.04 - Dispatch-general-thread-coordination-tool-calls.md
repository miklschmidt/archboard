---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.01
  - TASK-143.05.02
  - TASK-143.05.03
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-dynamic-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own `item/tool/call` validation and the six-tool target-state matrix in `src/runtime/codex-dynamic-tools`. It delegates execution to the typed session, wait graph, approval broker, thread-link, and instruction ports and owns no second thread store.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only server-supplied child/thread/turn/call/namespace/tool identity and decoded arguments are trusted; invalid identity, schema, namespace, tool, prior epoch, unavailable target, or cycle fails closed.
- [ ] #2 List/read inspect persisted threads without loading them; create starts a general Archboard thread; fork requires a loaded controllable manifest-matched source; send and wait follow the explicit idle/active/attached/created target matrix.
- [ ] #3 Create, fork, and arbitrary send require fresh approval; list/read/wait do not. Self-fork uses `beforeTurnId` equal to the executing turn and inherits without overrides.
- [ ] #4 Real-process tests exercise all six tools, every target state, approval revalidation/decline, cancellation before and after mutation dispatch, cycle cleanup, text-only output, and two-home isolation.
<!-- AC:END -->
