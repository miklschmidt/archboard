---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:40'
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
- [ ] #1 Only server-supplied child/thread/turn/call/namespace/tool identity and decoded arguments are trusted; each call records a stable operation correlation and invalid identity/schema/namespace/tool/epoch/target/cycle fails closed.
- [ ] #2 A checked target-state table covers all six tools across persisted-not-loaded, current loaded controllable/uncontrollable, idle, active, attached, created, self, prior-epoch, failed, completed, and child-exit states with one exact result per cell.
- [ ] #3 List/read inspect without loading; create uses reviewed instructions and manifest; fork requires loaded controllable manifest match; send/wait follow the table. Create/fork/arbitrary send require fresh broker approval; self-fork uses executing beforeTurnId and no overrides.
- [ ] #4 Cancellation before dispatch prevents mutation; cancellation after an app-server mutation returns outcome_unknown unless the response proves delivered/not_delivered, and cleanup removes wait-graph/call state exactly once.
- [ ] #5 Real-process tests in src/runtime/codex-dynamic-tools/tests exercise every schema and state cell, approval verdict, lost response, cancellation boundary, cycle cleanup, text-only result, and two-home isolation.
<!-- AC:END -->
