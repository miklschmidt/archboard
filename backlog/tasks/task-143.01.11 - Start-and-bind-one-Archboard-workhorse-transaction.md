---
id: TASK-143.01.11
title: Start and bind one Archboard workhorse transaction
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-workhorse-start
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one serialized start-and-bind transaction for an Archboard-created workhorse using the literal reviewed ThreadStartParams profile. It verifies the returned thread itself and compensates only a newly created, confirmed, idle root; it never selects or deletes by recency. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact ThreadStartParams included fields and intentional omissions match the authored workhorse profile: checkout cwd/sole runtime root, paginated persistence, startup/archboard source, instructions, eager tools, inherited provider/model/approval/sandbox/environment policy, and disabled raw events.
- [ ] #2 The transaction stages one thread/start, verifies returned ThreadId/cwd/root/history/source/threadSource/model/provider/tier plus start-response approvalPolicy, approvalsReviewer, sandbox, and activePermissionProfile, then commits provenance/hashes and binds exactly once.
- [ ] #3 Before confirmed start, failure rolls back locally. After confirmed start but failed bind, delete is allowed only after re-reading that new idle root; failed/lost delete becomes inspect_only.
- [ ] #4 A lost thread/start response is outcome_unknown, never retried, inferred, or cleaned up; every staged/confirmed/bind/cleanup boundary is tested.
<!-- AC:END -->
