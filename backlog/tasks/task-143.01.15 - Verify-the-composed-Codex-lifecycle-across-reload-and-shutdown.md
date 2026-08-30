---
id: TASK-143.01.15
title: Verify the composed Codex lifecycle across reload and shutdown
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - tests/system/process-contracts/codex-workbench-lifecycle.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one real-process lifecycle owner for the production Codex composition seam. This task tests the public server boundary; it does not instantiate an alternate graph or reach into private module state. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A controlled exact-version stdio child proves startup, initialized/storage/login readiness, browser registration, and one executable thread link through the production server entrypoint.
- [ ] #2 Hot reload during an in-flight client RPC and each supported reverse-request family replaces generation-bound handlers while preserving only version-neutral state and one child, listener, coordinator, queue, approval broker, and spoken gate.
- [ ] #3 Child exit, startup refusal, SIGINT, SIGTERM, and normal server close settle or classify every pending operation, stop realtime, reap the child after the documented TERM/KILL bounds, close transport after reverse requests settle, and leave no orphan process or listener.
- [ ] #4 The owner observes public events and process state only; a fake whose behavior is version-decoded and deterministic covers lost responses and late results without weakening the separate clean-process smoke.
<!-- AC:END -->
