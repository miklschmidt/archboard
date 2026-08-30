---
id: TASK-143.01.09
title: Classify and bind current-epoch thread links
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.08
  - TASK-143.01.17
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-thread-link
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fully discover, classify, and bind one current-epoch pane thread link by joining paginated persisted thread rows with paginated loaded thread IDs. No loaded-list response is treated as a Thread object.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The classifier exhausts thread/list and thread/loaded/list, joins loaded IDs to Thread rows by exact ThreadId, and never infers membership from recency, status, or a partial page.
- [ ] #2 Execution requires current child/epoch, literal top-level source cli|vscode|exec|appServer, loaded membership, and canAcceptDirectInput === true; custom/subAgent/unknown sources and false/null capability have distinct refusal reasons.
- [ ] #3 Persisted-not-loaded, notLoaded, systemError, stale child, prior epoch, unknown provenance/source, absent join row, and outcome-unknown creation remain inspect-only with actionable reasons.
- [ ] #4 Bindings compare-and-swap pane/link identity and tests cover cursor exhaustion, repeated cursors, disappearing rows, duplicate IDs, stale responses, all four allowed sources, all refused source variants, and every refusal.
<!-- AC:END -->
