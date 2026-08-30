---
id: TASK-143.07.03
title: Execute four bound workhorse operations
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.01.09
  - TASK-143.06.01
  - TASK-143.07.01
  - TASK-143.07.02
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-operations
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own inspect, delegate, queue-management, and conditional steer effects in `src/runtime/codex-workhorse-operations`. Caller-selected targets are impossible because the host injects the linked workhorse identity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inspect is read-only; idle delegation starts one bound turn with exact Archboard additionalContext; busy created work may queue; busy attached work accepts only a related correction through steer with exact context and expectedTurnId.
- [ ] #2 The host injects the linked workhorse and current coordinator identities; prior-epoch, cross-domain, self, unavailable, manifest mismatch, or unrelated attached-busy target fails closed.
- [ ] #3 The operation consumes TASK-143.07.01's read-only Explicit corrections, Coordinator judgment, or Never steer policy for this decision and returns stable cross-timeline operation correlation.
- [ ] #4 Tests in src/runtime/codex-workhorse-operations/tests cover every idle/active/attached/created branch, one bounded coordinator board action, lost response, and cancellation before/after dispatch without duplicate turns.
<!-- AC:END -->
