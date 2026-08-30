---
id: TASK-143.01.11
title: Start and bind one Archboard workhorse transaction
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-start
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one serialized start-and-bind transaction for an Archboard-created workhorse. It verifies the returned thread itself and compensates only a newly created, confirmed, idle root; it never selects or deletes by recency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The transaction stages a CAS operation, starts exactly one thread, and verifies returned ThreadId, absolute cwd, sole workspace root, persistent history mode, allowed source, Archboard threadSource, requested settings, loaded membership, and canAcceptDirectInput true before commit/bind.
- [ ] #2 Confirmed success commits epoch provenance plus instruction/manifest hashes and binds once; any mismatched returned identity or configuration refuses without finding a replacement thread.
- [ ] #3 Before a confirmed start, failure rolls back locally. After confirmed start but failed bind, cleanup may delete only that newly created idle root after re-reading identity/state; failed or lost delete becomes inspect_only.
- [ ] #4 A lost thread/start response is outcome_unknown, never retried, inferred from recency, or cleaned up; process tests cover every boundary and stale concurrent pane mutation.
<!-- AC:END -->
