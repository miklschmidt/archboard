---
id: TASK-143.06.07
title: Remove legacy injection timing constants
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.16
  - TASK-143.06.04
  - TASK-143.06.06
modified_files:
  - src/shared/timing/timing.ts
  - src/shared/timing/tests/codex-workbench-policy.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove only the superseded injection debounce/min-interval names after replacement consumers use the shared Codex timing policy. This is the sole second serialized edit of src/shared/timing/timing.ts. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DEFAULT_INJECT_DEBOUNCE_MS, DEFAULT_INJECT_MIN_INTERVAL_MS, their environment overrides, comments, and tests are removed after no source consumer remains.
- [ ] #2 The existing change-feed settle timings and all new workbench process/RPC/lease/approval/semantic/realtime/shutdown bounds remain named and coupled as documented.
- [ ] #3 Repository search and timing tests reject ARCHBOARD_INJECT timing names outside historical documents and show no local numeric replacement.
- [ ] #4 The serialized diff after TASK-143.01.16 is formatting/lint/type clean and changes no accepted duration.
<!-- AC:END -->
