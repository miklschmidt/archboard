---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.01
  - TASK-143.05.02
  - TASK-143.05.03
references:
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-dynamic-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own item/tool/call validation, exact target/transaction policy, and response construction for the six general tools. Session, wait graph, broker, link, and catalogue remain separate ports. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls validate the authored literal target table for all six tools across epoch, created/attached/foreign provenance, loaded state, direct-input capability, every status, and self/other; every unlisted cell has the authored refusal.
- [ ] #2 create/fork/send use the exact authored ThreadStartParams, ThreadForkParams, TurnStartParams and two-boundary result schemas. Confirmed identities survive initial-turn rejection/uncertainty; no mutation retries.
- [ ] #3 list/read use the exact thread/list, loaded/list, turns/list, and conditional items/list bodies/directions/limits; summary/output projection and epoch/method/query-bound cursors match the authored contract. wait accepts/resumes only a cursor bound to the sorted target set.
- [ ] #4 Successful effects record confirmed identity/hashes; this module constructs general tool responses while transport writes once. Fake-port tests exhaust every table/body/page/projection/attention/cancellation/cycle/uncertainty cell.
<!-- AC:END -->
