---
id: TASK-143.07.02
title: Own coordinator workhorse queue policy
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 17:03'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.02
  - TASK-143.05.03
  - TASK-143.07.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-workhorse-queue
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own coordinator-to-workhorse queue policy and the sole typed queue RPC port. The 0.151.0 API has no queue version/CAS, so host commands serialize locally and reconcile from authoritative pages. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The coordinator queue contract is one single-writer host command surface: enqueue, reorder, pause, resume, cancel, and list; its snapshots expose no synthetic revision field.
- [ ] #2 The host serializes Archboard-issued mutations per coordinator and immediately reconciles every result with an authoritative queue list; concurrent server-originated change during reconciliation yields outcome_unknown and a fresh list instead of guessed success.
- [ ] #3 Mutating commands require the exact current coordinator thread link and child workhorse link; stale epochs or links fail closed before dispatch.
- [ ] #4 Unit tests cover serialization, all commands, authoritative reconciliation, concurrent server activity, stale-link rejection, and outcome_unknown recovery.
<!-- AC:END -->
