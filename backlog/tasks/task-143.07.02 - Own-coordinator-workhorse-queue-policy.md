---
id: TASK-143.07.02
title: Own coordinator workhorse queue policy
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 17:31'
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
Own coordinator-to-workhorse queue policy and the sole typed queue RPC port. It exposes the six literal 0.151.0 operations and serializes Archboard commands before authoritative reconciliation. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The contract exposes only add, list, update, delete, reorder, and start; UI Edit maps to update and Cancel maps to delete, with no additional operation or synthetic revision field.
- [ ] #2 add/update use the literal UserInput text shape and host-minted clientUserMessageId where required; delete/start use queuedSubmissionId, reorder uses the complete ordered ID array, and list exhausts authoritative pages with repeated-cursor detection.
- [ ] #3 The host serializes Archboard-issued mutations per coordinator and immediately reconciles each result with authoritative queue pages; concurrent server activity yields outcome_unknown plus the fresh list instead of guessed success.
- [ ] #4 Mutations require exact current coordinator/workhorse links. Tests cover all six bodies, UI mappings, serialization, reconciliation, concurrent activity, stale links, pagination, and uncertainty.
<!-- AC:END -->
