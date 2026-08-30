---
id: TASK-143.07.02
title: Own coordinator workhorse queue policy
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.02
  - TASK-143.05.03
  - TASK-143.07.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-queue
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own coordinator-to-workhorse queue policy and the sole typed queue RPC port. It does not execute operations, start coordinator callbacks, or render queue UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The port fully paginates queue reads and exposes add/update/delete/reorder/start with QueuedSubmissionId, clientUserMessageId, order/version, and delivered/not_delivered/outcome_unknown results.
- [ ] #2 Queue mutation is allowed only for a current-epoch Archboard-created workhorse with matching persisted instruction/manifest hashes; attached or uncertain-provenance workhorses cannot receive queued work.
- [ ] #3 Active attached work may be eligible for exact-turn steer through TASK-143.07.03 but is never silently queued; inactive attached work starts only through ordinary explicit delegation policy.
- [ ] #4 Lost queue responses are never repeated, stale versions refuse, and tests cover pagination, CAS conflicts, reorder, start, child/link replacement, cancellation, and cleanup.
<!-- AC:END -->
